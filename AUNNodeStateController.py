class AUNNodeStateController:
    """Combine collapse/expand and bypass/mute controls targeting nodes by:
    - Node IDs (comma separated list)
    - Group Title (exact match)
    - Node Titles (one per line)

    Modes:
      Combined ON: Force collapse + disable (bypass or mute) all targets.
      Combined OFF: Independently set Collapse and Active (bypass/mute false => disabled when Active=False).

        Notes / Limitations:
            * Mute now supported for Group Title by iterating nodes in that group and sending individual mute events (no dedicated group mute event).
            * For Node Titles mute also supported.
            * When switching between mute/bypass on IDs we clear the other state to avoid stale flags.
    """

    CATEGORY = "AUN Nodes/Node Control"
    FUNCTION = "execute"
    RETURN_TYPES = ()
    RETURN_NAMES = ()
    OUTPUT_NODE = True
    DESCRIPTION = "Control collapse + bypass or mute for nodes by ID, group, or title."

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "target_mode": (["Node IDs", "Group Title", "Node Titles"], {"tooltip": "Choose how to target nodes."}),
                "node_ids": ("STRING", {"default": "", "multiline": False, "tooltip": "Comma-separated node IDs (e.g. 5,12,23) when mode is 'Node IDs'."}),
                "group_title": ("STRING", {"default": "", "multiline": False, "tooltip": "Group title to target (supports partial match and '!' or '-' for exclusion)."}),
                "group_exclude_titles": ("STRING", {"default": "", "multiline": True, "tooltip": "(Group mode only) Node titles to EXCLUDE (newline, comma, or semicolon separated). Supports partial match."}),
                "node_titles": ("STRING", {"default": "", "multiline": True, "tooltip": "Node titles to target (newline, comma, or semicolon separated). Use '!' or '-' prefix for exclusion (e.g. 'image, !load')."}),
                "combined": ("BOOLEAN", {"default": False, "label_on": "Combined On", "label_off": "Combined Off", "tooltip": "When ON: collapse + disable in one action (Active ignored)."}),
                "use_mute": ("BOOLEAN", {"default": False, "label_on": "Mute", "label_off": "Bypass", "tooltip": "If ON uses mute (IDs, Group Title, or Node Titles). Otherwise bypass."}),
                "collapse": ("BOOLEAN", {"default": False, "label_on": "Collapsed ▶", "label_off": "Expanded ▼", "tooltip": "Collapsed (▶) hides body; Expanded (▼) shows it (ignored if Combined On)."}),
                "active": ("BOOLEAN", {"default": True, "label_on": "Active", "label_off": "Disabled", "tooltip": "Enable (active) or disable (bypass/mute) nodes when Combined Off."}),
            }
        }

    def _parse_node_ids(self, text):
        ids = []
        for part in text.split(','):
            p = part.strip()
            if not p:
                continue
            try:
                ids.append(int(p))
            except ValueError:
                print(f"[AUNNodeStateController] Invalid node id '{p}' - skipping")
        return ids

    def _parse_titles(self, text):
        import re
        return [l.strip() for l in re.split(r'[,\n;]+', text) if l.strip()]

    def execute(self, target_mode, node_ids, group_title, group_exclude_titles, node_titles, combined, use_mute, collapse, active):
        try:
            from server import PromptServer
        except Exception as e:
            print(f"[AUNNodeStateController] Could not import PromptServer: {e}")
            return ()

        try:
            combined = bool(combined)
            use_mute = bool(use_mute)
            collapse_state = True if combined else bool(collapse)
            is_active_state = False if combined else bool(active)

            if target_mode == "Node IDs":
                id_list = self._parse_node_ids(node_ids)
                if not id_list:
                    return ()
                for nid in id_list:
                    if combined:
                        # collapse + disable
                        PromptServer.instance.send_sync("AUN_set_collapse_state", {"node_id": nid, "collapse": True})
                        if use_mute:
                            PromptServer.instance.send_sync("AUN-node-mute-state", {"node_id": nid, "is_active": False})
                        else:
                            PromptServer.instance.send_sync("AUN_node_bypass_state", {"node_id": nid, "is_active": False})
                    else:
                        # Independent states
                        if use_mute:
                            PromptServer.instance.send_sync("AUN-node-mute-state", {"node_id": nid, "is_active": is_active_state})
                            # Clear bypass to active to prevent stale disable
                            PromptServer.instance.send_sync("AUN_node_bypass_state", {"node_id": nid, "is_active": True})
                        else:
                            PromptServer.instance.send_sync("AUN_node_bypass_state", {"node_id": nid, "is_active": is_active_state})
                            # Clear mute to active
                            PromptServer.instance.send_sync("AUN-node-mute-state", {"node_id": nid, "is_active": True})
                        PromptServer.instance.send_sync("AUN_set_collapse_state", {"node_id": nid, "collapse": collapse_state})
                mode = "mute" if use_mute else "bypass"
                #print(f"[AUNNodeStateController] IDs {id_list} collapse={collapse_state} active={is_active_state} mode={mode} combined={combined}")

            elif target_mode == "Group Title":
                group_title = group_title.strip()
                if not group_title:
                    return ()
                desired_active = True if not combined and is_active_state else False
                excludes = set(self._parse_titles(group_exclude_titles)) if group_exclude_titles else set()
                used_titles = []
                use_titles_path = False
                try:
                    graph = getattr(PromptServer.instance, 'last_prompt', {}) or {}
                    wf = graph.get('workflow') if isinstance(graph, dict) else None
                    nlist = (wf or {}).get('nodes') if isinstance(wf, dict) else None
                    if isinstance(nlist, list):
                        for n in nlist:
                            if isinstance(n, dict) and n.get('group') == group_title:
                                t = n.get('title')
                                if t and t not in excludes:
                                    used_titles.append(t)
                    if excludes and used_titles:
                        use_titles_path = True  # must operate at title granularity for excludes
                except Exception:
                    pass

                if use_titles_path and used_titles:
                    # Collapse by titles
                    try:
                        PromptServer.instance.send_sync("AUN_set_collapse_by_titles", {"titles": used_titles, "collapse": collapse_state})
                    except Exception:
                        pass
                    if use_mute:
                        PromptServer.instance.send_sync("AUN_set_mute_by_titles", {"titles": used_titles, "is_active": desired_active})
                        mode = "mute-titles"
                    else:
                        PromptServer.instance.send_sync("AUN_set_bypass_by_titles", {"titles": used_titles, "is_active": desired_active})
                        mode = "bypass-titles"
                    #print(f"[AUNNodeStateController] Group '{group_title}' (titles path) collapse={collapse_state} active={desired_active} excludes={len(excludes)} mode={mode}")
                else:
                    # Fallback to group-wide events (no excludes or couldn't resolve titles)
                    PromptServer.instance.send_sync("AUN_set_collapse_state_group", {"group_title": group_title, "collapse": collapse_state})
                    if use_mute:
                        # revert to previous best-effort per-title mute path
                        try:
                            graph = getattr(PromptServer.instance, 'last_prompt', {}) or {}
                            wf = graph.get('workflow') if isinstance(graph, dict) else None
                            nlist = (wf or {}).get('nodes') if isinstance(wf, dict) else None
                            titles = []
                            if isinstance(nlist, list):
                                for n in nlist:
                                    if isinstance(n, dict) and n.get('group') == group_title:
                                        t = n.get('title')
                                        if t:
                                            titles.append(t)
                            if titles:
                                PromptServer.instance.send_sync("AUN_set_mute_by_titles", {"titles": titles, "is_active": desired_active})
                            else:
                                PromptServer.instance.send_sync("AUN_set_bypass_by_group_title", {"group_title": group_title, "is_active": desired_active})
                        except Exception:
                            PromptServer.instance.send_sync("AUN_set_bypass_by_group_title", {"group_title": group_title, "is_active": desired_active})
                        #print(f"[AUNNodeStateController] Group '{group_title}' collapse={collapse_state} active={desired_active} mode=mute (fallback) excludes={len(excludes)}")
                    else:
                        PromptServer.instance.send_sync("AUN_set_bypass_by_group_title", {"group_title": group_title, "is_active": desired_active})
                        #print(f"[AUNNodeStateController] Group '{group_title}' collapse={collapse_state} active={desired_active} mode=bypass excludes={len(excludes)}")

            elif target_mode == "Node Titles":
                titles = self._parse_titles(node_titles)
                if not titles:
                    return ()
                # Determine active flag depending on combined
                state_active = True if not combined and is_active_state else False
                # Collapse via new event (client will listen) when collapse requested or combined
                try:
                    PromptServer.instance.send_sync("AUN_set_collapse_by_titles", {"titles": titles, "collapse": collapse_state})
                except Exception:
                    pass
                if use_mute:
                    # Send mute by titles
                    PromptServer.instance.send_sync("AUN_set_mute_by_titles", {"titles": titles, "is_active": state_active})
                    mode = "mute"
                else:
                    # Send bypass by titles
                    PromptServer.instance.send_sync("AUN_set_bypass_by_titles", {"titles": titles, "is_active": state_active})
                    mode = "bypass"
                #print(f"[AUNNodeStateController] Titles {titles} active={state_active} combined={combined} mode={mode}")

        except Exception as e:
            print(f"[AUNNodeStateController] Error executing control: {e}")
        return ()


NODE_CLASS_MAPPINGS = {"AUNNodeStateController": AUNNodeStateController}
NODE_DISPLAY_NAME_MAPPINGS = {"AUNNodeStateController": "AUN Node State Controller"}
