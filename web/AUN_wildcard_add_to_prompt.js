import { app } from "../../scripts/app.js";

const PLACEHOLDER_VALUES = new Set([
  "Select wildcard...",
  "No wildcards found",
]);

function appendWildcardToken(existingText, token) {
  const current = typeof existingText === "string" ? existingText : "";
  if (!current.trim()) {
    return token;
  }
  if (/[\s,]$/.test(current)) {
    return `${current}${token}`;
  }
  return `${current}, ${token}`;
}

app.registerExtension({
  name: "AUN.WildcardAddToPrompt",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!nodeData || nodeData.name !== "AUNWildcardAddToPrompt") return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      onNodeCreated?.apply(this, arguments);

      const textWidget = this.widgets?.find(
        (widget) => widget.name === "text_to_add",
      );
      const selectorWidget = this.widgets?.find(
        (widget) => widget.name === "wildcard_selector",
      );
      if (
        !textWidget ||
        !selectorWidget ||
        selectorWidget.__aunWildcardSelectorHooked
      ) {
        return;
      }

      selectorWidget.__aunWildcardSelectorHooked = true;
      selectorWidget.options = selectorWidget.options || {};
      const originalCallback =
        typeof selectorWidget.callback === "function"
          ? selectorWidget.callback
          : null;

      const resetSelector = () => {
        const firstValue =
          selectorWidget.options?.values?.[0] ?? "Select wildcard...";
        selectorWidget.value = firstValue;
      };

      selectorWidget.callback = (value) => {
        try {
          originalCallback?.call(selectorWidget, value);
        } catch (error) {
          console.warn(
            "AUNWildcardAddToPrompt selector callback failed",
            error,
          );
        }

        if (!value || PLACEHOLDER_VALUES.has(String(value))) {
          return;
        }

        textWidget.value = appendWildcardToken(textWidget.value, String(value));

        try {
          textWidget.callback?.(textWidget.value);
        } catch (error) {
          console.warn("AUNWildcardAddToPrompt text callback failed", error);
        }

        resetSelector();
        this.setDirtyCanvas?.(true, true);
        this.graph?.setDirtyCanvas?.(true, true);
      };

      selectorWidget.serializeValue = () =>
        selectorWidget.options?.values?.[0] ?? "Select wildcard...";
      resetSelector();
    };
  },
});
