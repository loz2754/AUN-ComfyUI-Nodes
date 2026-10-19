import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "AUNNodes.InputsBasic.Constant",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === "AUNInputsBasic") {
            nodeType.prototype.obvpmConstantWidget = "set";
            // bundle output is the last output slot
            nodeType.prototype.obvpmConstantOutput = 13;
        }
    }
});
