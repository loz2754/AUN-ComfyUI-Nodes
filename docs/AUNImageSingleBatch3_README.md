# AUNImageSingleBatch3 — Advanced Image Loader with Search

Purpose: Load images from uploads or batch process folders with multiple selection modes, including filename search filtering.

## Inputs:

### Source Configuration:
- `source_mode` (DROPDOWN): Choose between "Single Image Upload" or "Batch from Folder"
- `path_mode` (DROPDOWN): For batch mode - "Pre-defined" (from config) or "Manual" path entry
- `predefined_path` (DROPDOWN): Select from predefined paths (edit `predefined_paths.json` to customize)
- `manual_path` (STRING): Enter custom folder path when using manual mode
- `image_upload` (FILE): Select image file when using single upload mode

### Batch Processing:
- `batch_mode` (DROPDOWN): How to select images from folder:
  - **increment**: Cycle forward through files sequentially
  - **decrement**: Cycle backward through files sequentially  
  - **random**: Select random file each time
  - **fixed**: Use specific index from `range_or_pattern`
  - **range**: Cycle through specified indices from `range_or_pattern`
  - **search**: Filter files by pattern, then increment through matches

- `range_or_pattern` (STRING): Multi-purpose field that serves different functions based on batch mode:
  - **For fixed/range modes**: Comma-separated indices or ranges (e.g., `2,3,4-7,10`)
  - **For search mode**: Search pattern supporting multiple formats:

- `max_num_words` (INT): When > 0, limits both filename outputs to the first N words.

## Search Pattern Examples:

### Wildcard Patterns:
- `portrait*` - Files starting with "portrait"
- `*face*` - Files containing "face" anywhere
- `woman_*` - Files starting with "woman_"
- `*_final` - Files ending with "_final"
- `img_???` - Files like "img_001", "img_abc" (3 chars after underscore)

### Regular Expressions:
- `.*face.*` - Files containing "face" (regex version)
- `img_\d+` - Files like "img_123", "img_42" (numbers after underscore)
- `^portrait_[0-9]{3}$` - Files like "portrait_001", "portrait_999"
- `(woman|man)_.*` - Files starting with "woman_" or "man_"

### Simple Text Search:
- `face` - Simple substring search (case-insensitive)
- `portrait` - Find any filename containing "portrait"

## Outputs:
- `image` (IMAGE): Loaded image tensor
- `filename` (STRING): Original filename without extension
- `cleaned filename` (STRING): Sanitized filename suitable for output paths (symbols removed, whitespace normalized, and optional trailing numeric counter trimmed).

## Usage Examples:

### Basic Batch Processing:
1. Set `source_mode` to "Batch from Folder"
2. Choose your path (predefined or manual)
3. Set `batch_mode` to "increment" 
4. Leave `range_or_pattern` as "0"
5. Each execution loads the next image in sequence

### Range Selection:
1. Set `batch_mode` to "range"
2. Set `range_or_pattern` to "0,2,5-10" to cycle through specific images
3. Node will loop through indices: 0, 2, 5, 6, 7, 8, 9, 10

### Search Filtering:
1. Set `batch_mode` to "search"
2. Set `range_or_pattern` to your search pattern (e.g., `portrait*`)
3. Node filters folder to matching files, then cycles through them
4. If no matches found, displays helpful error message

## Configuration:

### Predefined Paths:
Edit `predefined_paths.json` in the AUN folder to customize available paths:
```json
[
    "C:/MyImages/Portraits", 
    "D:/Photos/Landscapes",
    "N:/SharedImages"
]
```

## Tips:
- **Performance**: Search filtering only re-scans when folder, pattern, or batch mode changes
- **Error Handling**: Clear error messages when no files match search patterns
- **Regex Validation**: Invalid regex patterns are caught during input validation
- **Case Insensitive**: All search patterns work case-insensitively
- **File Types**: Supports PNG, JPG, JPEG, BMP, and WebP images
- **State Management**: Maintains position in sequence across executions

## Advanced Use Cases:

### Progressive Filtering:
Use search mode to work with specific subsets:
- `*_highres*` - Only high resolution variants
- `test_*` - Only test images  
- `final_*` - Only final versions

### Organized Workflows:
Combine with other AUN nodes for complex workflows:
- Use `AUNSaveImage` with the cleaned filename output
- Chain multiple instances for different image categories
- Use search patterns to separate processing pipelines

## Notes:
- Search functionality uses filename without extension
- Wildcard patterns use standard file globbing rules
- Regex patterns provide maximum flexibility for complex matching
- Empty search patterns in search mode show all files
- Node remembers last position for each unique folder/pattern combination