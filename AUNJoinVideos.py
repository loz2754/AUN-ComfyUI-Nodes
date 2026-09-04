"""Join-videos helper node (extracted from AUNSaveVideo.py).

Not registered in __init__.py (same as before the split): used internally
by AUNSaveVideo only.
"""
import json
import os
import re
import shutil
import subprocess
import time

import folder_paths

from .misc import (
    get_clean_filename,
    get_file_extension_without_dot,
    is_video,
    resolve_file_path,
)

class JoinVideosInDirectory:

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": 
                    {
                        "directory_containing_videos": ("STRING", {"default": "/path/"}),
                        "output_file_path": ("STRING", {"default": "/path/"}),
                        "audio_input_options": ("AUDIO_INPUT_OPTIONS",),
                        "delete_directory_containing_videos": ("BOOLEAN", {"default": False}),
                     },
                "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }
        
    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = "join_videos_in_directory"
    
    def _safe_remove(self, path, attempts: int = 8, delay_sec: float = 0.25):
        """Attempt to remove a file with retries to avoid Windows file-lock issues."""
        if not path:
            return True
        for _ in range(attempts):
            try:
                if os.path.exists(path):
                    os.remove(path)
                return True
            except PermissionError:
                time.sleep(delay_sec)
            except Exception:
                break
        return False

    def _rmtree_with_retry(self, path, attempts: int = 20, delay_sec: float = 0.25):
        """Attempt to remove a directory tree with retries.
        Returns True on success, False if it ultimately failed (but suppresses exceptions)."""
        if not path:
            return True
        for _ in range(attempts):
            try:
                if os.path.exists(path):
                    shutil.rmtree(path)
                return True
            except PermissionError:
                time.sleep(delay_sec)
            except Exception:
                # Wait and retry a bit for transient errors
                time.sleep(delay_sec)
        # Final attempt ignoring errors
        try:
            shutil.rmtree(path, ignore_errors=True)
        except Exception:
            pass
        return False

    def _probe_video_codec(self, file_path: str) -> str | None:
        try:
            result = subprocess.run(
                [
                    'ffprobe', '-v', 'error', '-select_streams', 'v:0',
                    '-show_entries', 'stream=codec_name', '-of', 'default=nw=1:nk=1', file_path
                ],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True
            )
            codec = result.stdout.strip().lower()
            return codec or None
        except Exception:
            return None

    def join_videos_in_directory(
        self,
        directory_containing_videos,
        output_file_path,
        audio_input_options,
        delete_directory_containing_videos=False,
        metadata_path: str | None = None,
        use_mov_metadata_flags: bool = False,
    ):

        directory_containing_videos = resolve_file_path(directory_containing_videos)
        output_file_path = resolve_file_path(output_file_path)

        full_output_directory = os.path.dirname(output_file_path)
        os.makedirs(full_output_directory, exist_ok=True)         

        # Get a list of video files in the folder
        video_files = [f for f in os.listdir(directory_containing_videos) if is_video(os.path.join(directory_containing_videos, f))]

        if not video_files:
            print("No video files found in the folder.")
            return

        should_apply_audio = False
        if audio_input_options:
            audio_input_path = audio_input_options.get("audio_input_path")
            should_apply_audio = os.path.isfile(audio_input_path) and self.has_audio_track(audio_input_path)

        if not should_apply_audio and len(video_files) == 1:
            source_file = os.path.join(directory_containing_videos, video_files[0])

            if source_file != output_file_path:
                try:
                    shutil.copy(source_file, output_file_path)
                    print(f"Single video file copied from {source_file} to {output_file_path}")
                except IOError as e:
                    print(f"An error occurred while copying the file: {e}")
        else:

            def alphanumeric_sort_key(filename):
                """Sort filenames alphanumerically."""
                return [int(text) if text.isdigit() else text.lower() for text in re.split('([0-9]+)', filename)]

            # Sort video files to maintain order
            video_files.sort(key=alphanumeric_sort_key)

            # Create a file to list video files
            list_file_path = os.path.join(directory_containing_videos, 'video_list.txt')

            with open(list_file_path, 'w') as list_file:
                for video_file in video_files:
                    list_file.write(f"file '{os.path.join(directory_containing_videos, video_file)}'\n")       
            
            # Preemptively create trimmed audio path even if we don't need it 
            trimmed_audio_path = os.path.join(directory_containing_videos, 'trimmed_audio.aac')

            # Determine if we need to re-encode video based on target container/codec
            target_ext = os.path.splitext(output_file_path)[1].lower().lstrip('.')
            first_input = os.path.join(directory_containing_videos, video_files[0])
            input_vcodec = self._probe_video_codec(first_input)
            vcodec = 'copy'
            vcodec_extra = []
            if target_ext == 'webm':
                # WebM requires VP8/9/AV1
                if input_vcodec not in ('vp8', 'vp9', 'av1'):
                    vcodec = 'libvpx-vp9'
                    vcodec_extra = ['-b:v', '0', '-pix_fmt', 'yuv420p']

            # Build the ffmpeg command to concatenate videos and apply audio
            if should_apply_audio:
                audio_codec = 'aac'
                if output_file_path.endswith("webm"):
                    audio_codec = 'libopus'
                audio_input_path = audio_input_options.get("audio_input_path")                
                clip_audio = audio_input_options.get("clip_audio", False)
                audio_clip_start_seconds = audio_input_options.get("audio_clip_start_seconds", 0)
                audio_clip_duration = audio_input_options.get("audio_clip_duration", 0)

                use_whole_audio = audio_clip_start_seconds == 0 and audio_clip_duration == 0

                if clip_audio and not use_whole_audio:
                    # Trim the audio first
                    audio_duration = self.get_audio_duration(audio_input_path)
                    if audio_clip_duration == 0 or audio_clip_start_seconds + audio_clip_duration > audio_duration:
                        audio_clip_duration = audio_duration - audio_clip_start_seconds
                    audio_trim_command = [
                        'ffmpeg',
                        '-i', audio_input_path,
                        '-ss', str(audio_clip_start_seconds),
                        '-t', str(audio_clip_duration),
                        '-ac', '2', # Force stereo for now
                        '-c:a', 'aac',
                        '-loglevel', 'quiet',
                        trimmed_audio_path
                    ]
                    try:
                        subprocess.run(audio_trim_command, check=True)
                        print(f"Trimmed audio saved to {trimmed_audio_path}")
                    except subprocess.CalledProcessError as e:
                        print(f"An error occurred during audio trimming: {e}")
                        return
                    audio_path_to_use = trimmed_audio_path
                else:
                    audio_path_to_use = audio_input_path

                ffmpeg_command_final = [
                    'ffmpeg',
                    '-f', 'concat',
                    '-safe', '0',
                    '-i', list_file_path,
                    '-i', audio_path_to_use,
                ]
                if metadata_path and os.path.exists(metadata_path):
                    ffmpeg_command_final += ['-i', metadata_path]
                ffmpeg_command_final += [
                    '-map', '0:v',
                    '-map', '1:a',
                    '-c:v', vcodec,
                    *vcodec_extra,
                    '-c:a', audio_codec,
                    '-strict', 'experimental',
                    '-loglevel', 'quiet',
                ]
                if metadata_path and os.path.exists(metadata_path):
                    ffmpeg_command_final += ['-map_metadata', '2']
                if use_mov_metadata_flags:
                    ffmpeg_command_final += ['-movflags', 'use_metadata_tags+faststart']
                ffmpeg_command_final += [output_file_path]

            else:
                # No audio file provided
                ffmpeg_command_final = [
                    'ffmpeg',
                    '-f', 'concat',
                    '-safe', '0',
                    '-i', list_file_path,
                ]
                if metadata_path and os.path.exists(metadata_path):
                    ffmpeg_command_final += ['-i', metadata_path]
                ffmpeg_command_final += [
                    '-c:v', vcodec,
                    *vcodec_extra,
                    '-strict', 'experimental',
                ]
                if metadata_path and os.path.exists(metadata_path):
                    ffmpeg_command_final += ['-map', '0:v', '-map_metadata', '1']
                if use_mov_metadata_flags:
                    ffmpeg_command_final += ['-movflags', 'use_metadata_tags+faststart']
                ffmpeg_command_final += [output_file_path]

            try:
                # Run ffmpeg to concatenate videos and optionally apply audio
                process_final = subprocess.Popen(
                    ffmpeg_command_final, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True
                )

                # Read the output and error streams
                stdout, stderr = process_final.communicate()

                # Wait for the process to finish
                process_final.wait()
                # Explicitly close streams and release process handles before file cleanup
                try:
                    if process_final.stdout:
                        process_final.stdout.close()
                except Exception:
                    pass
                try:
                    if process_final.stderr:
                        process_final.stderr.close()
                except Exception:
                    pass
                # Small delay to allow OS/ffmpeg to release file locks on Windows
                time.sleep(0.5)
                if process_final.returncode == 0:
                    print(f"\nProcessing complete. Output file: {output_file_path}")
                else:
                    print(f"\nAn error occurred during processing: ffmpeg process returned non-zero exit code {process_final.returncode}")
                    print(stdout)
                    print(stderr)
                    return

            except subprocess.CalledProcessError as e:
                print(f"\nAn error occurred: {e}")

            finally:
                # If caller wants the whole temp dir removed, prefer deleting the directory tree
                if delete_directory_containing_videos:
                    # Try to rename potentially locked files so the directory can be removed later
                    try:
                        if os.path.exists(list_file_path):
                            os.replace(list_file_path, list_file_path + ".del")
                    except Exception:
                        pass
                    try:
                        if os.path.exists(trimmed_audio_path):
                            os.replace(trimmed_audio_path, trimmed_audio_path + ".del")
                    except Exception:
                        pass
                    # Remove the temp directory with retries
                    self._rmtree_with_retry(directory_containing_videos, attempts=40, delay_sec=0.25)
                else:
                    # Otherwise, clean individual files with retries
                    self._safe_remove(list_file_path, attempts=40, delay_sec=0.25)
                    self._safe_remove(trimmed_audio_path, attempts=40, delay_sec=0.25)

    # Directory cleanup is handled in the finally block above when requested.

        output_directory = folder_paths.get_output_directory()
        temp_directory = folder_paths.get_temp_directory()

        save_to_output_dir = output_file_path.startswith(output_directory)
        save_to_temp_dir = output_file_path.startswith(temp_directory)

        # While saving anywhere is supported, we can only display temp/output types
        if save_to_output_dir or save_to_temp_dir:
            filename = get_clean_filename(output_file_path)     
            format_ext = get_file_extension_without_dot(output_file_path)       
            subfolder = full_output_directory.replace(
                output_directory if save_to_output_dir else temp_directory,""
            )
            if subfolder.startswith("/"):
                subfolder = subfolder[1:]
            subfolder = str(subfolder or "").replace("\\", "/")
            output_format = f"video/{format_ext}"
            
            previews = [
                {
                    "filename": f"{filename}.{format_ext}",
                    "subfolder": subfolder,
                    "type": "output" if save_to_output_dir else "temp",
                    "format": f"video/{format_ext}",
                }
            ]
            return {"ui": {"images": previews}}

        return {}

    def get_audio_duration(self, file_path):
        """Get the duration of an audio file in seconds."""
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file_path],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
        info = json.loads(result.stdout)
        return float(info['format']['duration'])

    def has_audio_track(self, file_path):
        try:
            # Run ffprobe command to get stream information in JSON format
            result = subprocess.run(
                [
                    'ffprobe',
                    '-v', 'error',
                    '-show_entries', 'stream=codec_type',
                    '-of', 'json',
                    file_path
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=True,
                text=True
            )

            # Parse the JSON output
            output = json.loads(result.stdout)
            streams = output.get('streams', [])

            # Check if any of the streams are of type 'audio'
            for stream in streams:
                if stream.get('codec_type') == 'audio':
                    return True
            
            return False

        except subprocess.CalledProcessError as e:
            print(f"An error occurred while running ffprobe: {e}")
            return False

