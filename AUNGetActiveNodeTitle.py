class AUNGetActiveNodeTitle:
    _last_workflow_data = None

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "node_titles": ("STRING", {
                    "multiline": False,
                    "default": "",
                    "tooltip": "Comma-separated list of node titles to check for active state. The node will check them in this order."
                }),
            },
            "hidden": {
                "extra_pnginfo": "EXTRA_PNGINFO"
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("active_title",)
    FUNCTION = "get_active_title"
    CATEGORY = "AUN Nodes/Utility"
    DESCRIPTION = "Scans a user-defined list of node titles and outputs the title of the first node in that list which is currently active (not bypassed) in the workflow."

    def get_active_title(self, node_titles, default_title="", extra_pnginfo=None):
        
        if not node_titles:
            return (default_title,)

        workflow_data = None
        if extra_pnginfo and 'workflow' in extra_pnginfo:
            workflow_data = extra_pnginfo.get('workflow', {})
            AUNGetActiveNodeTitle._last_workflow_data = workflow_data
        elif AUNGetActiveNodeTitle._last_workflow_data:
            workflow_data = AUNGetActiveNodeTitle._last_workflow_data
        else:
            return (default_title,)

        nodelist = workflow_data.get('nodes', [])
        definitions = workflow_data.get('definitions', {})
        subgraphs = definitions.get('subgraphs', [])

        if not nodelist:
            return (default_title,)
        
        subgraph_id_to_name = {sg['id']: sg.get('name') for sg in subgraphs if sg.get('name')}

        active_titles = set()
        for node in nodelist:
            if node.get('mode', 0) == 0:  # is active
                title = node.get('title')
                if not title:
                    node_type = node.get('type')
                    if node_type in subgraph_id_to_name:
                        title = subgraph_id_to_name[node_type]
                
                if title:
                    active_titles.add(title)
        
        # Also consider group titles if they exist
        grouplist = workflow_data.get('groups', [])
        group_map = {group.get('title'): group for group in grouplist if group.get('title')}

        titles_to_check = [title.strip() for title in node_titles.split(',') if title.strip()]

        for title_to_find in titles_to_check:
            # First, check if the title matches a directly active node (or subgraph name)
            if title_to_find in active_titles:
                return (title_to_find,)

            # If not, check if it's a group title
            if title_to_find in group_map:
                group = group_map[title_to_find]
                group_bounds = group.get('bounding')  # [x, y, w, h]
                
                if not group_bounds or len(group_bounds) < 4:
                    continue

                # Check if any active node is inside this group's bounding box
                for node in nodelist:
                    if node.get('mode', 0) == 0:  # Node is active
                        node_pos = node.get('pos')  # [x, y]
                        if not node_pos or len(node_pos) < 2:
                            continue
                        
                        # Check if the node's position is within the group's bounds
                        if (group_bounds[0] <= node_pos[0] < group_bounds[0] + group_bounds[2] and
                            group_bounds[1] <= node_pos[1] < group_bounds[1] + group_bounds[3]):
                            # Active node found within the group, so the group is "active"
                            return (title_to_find,)

        return (default_title,)

    @classmethod
    def IS_CHANGED(cls, *args, **kwargs):
        # This node's output depends on the bypass state of other nodes, which is not a direct input.
        # We must always re-execute it to get the current state of the workflow.
        import time
        return time.time()

NODE_CLASS_MAPPINGS = { "AUNGetActiveNodeTitle": AUNGetActiveNodeTitle, }
NODE_DISPLAY_NAME_MAPPINGS = { "AUNGetActiveNodeTitle": "AUN Get Active Node Title", }
