# AUN Wildcards

Put your local wildcard `.txt` files in this folder.

Examples:

- `artists.txt`
- `styles/lighting.txt`
- `subjects/animals.txt`

Each non-empty line becomes one possible value for that wildcard.

Examples:

- `artists.txt` -> `__artists__`
- `styles/lighting.txt` -> `__styles/lighting__`
- `subjects/animals.txt` -> `__subjects/animals__`

Notes:

- Lines starting with `#` are ignored.
- After adding new wildcard files, reload the custom nodes or restart ComfyUI so the selector list refreshes.
