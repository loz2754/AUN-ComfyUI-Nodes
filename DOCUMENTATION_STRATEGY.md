# AUN Nodes Documentation Strategy

## Overview
This document outlines the comprehensive documentation approach for all AUN nodes to improve user experience and accessibility.

## Documentation Levels

### 1. **In-Node Tooltips** (Immediate Help)
- **Purpose**: Provide instant context-sensitive help
- **Location**: Added to each input parameter in `INPUT_TYPES`
- **Content**: Brief, actionable descriptions of what each parameter does
- **Format**: `"tooltip": "Brief description of parameter function and expected values"`

### 2. **Node Descriptions** (Node Overview)
- **Purpose**: Explain the overall function and use case of the node
- **Location**: `DESCRIPTION` field in node class
- **Content**: 1-2 sentence summary of what the node does and when to use it
- **Format**: `DESCRIPTION = "Brief explanation of node purpose and primary use case."`

### 3. **Detailed Documentation** (Complete Reference)
- **Purpose**: Comprehensive guides with examples and advanced usage
- **Location**: Individual README files for complex nodes
- **Content**: Detailed explanations, examples, troubleshooting, and best practices
- **Format**: Markdown files with examples and screenshots

## Implementation Standards

### Tooltip Guidelines
- **Length**: 50-100 characters for simple parameters, up to 200 for complex ones
- **Tone**: Clear, direct, helpful
- **Content**: What it does + expected format/range
- **Examples**: Include example values when helpful

### Description Guidelines
- **Length**: 1-2 sentences maximum
- **Focus**: Primary purpose and main benefit
- **Audience**: Both beginners and advanced users
- **Clarity**: Avoid technical jargon when possible

### README Guidelines
- **Structure**: Purpose → Parameters → Examples → Tips
- **Examples**: Include practical workflow examples
- **Troubleshooting**: Common issues and solutions
- **Updates**: Keep in sync with node changes

## Node Categories for Documentation Priority

### **High Priority** (Complex/Frequently Used)
1. AUNKSamplerPlusv3 - Complex sampling with multiple upscaling options
2. AUNMultiCollapse - Multi-slot collapse/expand control
3. AUNSaveImage - Advanced image saving with metadata
4. AUNMultiBypass - Multi-slot bypass control
5. AUNIPAdapterUnified - Unified IP adapter functionality

### **Medium Priority** (Moderate Complexity)
1. AUNTextIndexSwitch series - Text switching logic
2. AUNSetCollapseState series - Collapse state management
3. AUNImageLoadResize - Image loading with resizing

### **Low Priority** (Simple/Self-Explanatory)
1. AUNBoolean - Simple boolean output
2. AUNRandomNumber - Random number generation
3. AUNAny - Pass-through node
4. AUNCFG - CFG value node

## Template Examples

### Tooltip Template
```python
"parameter_name": ("TYPE", {
    "default": value,
    "tooltip": "What this parameter controls and expected format/range"
})
```

### Description Template
```python
DESCRIPTION = "Brief explanation of what this node does and its primary use case."
```

### README Template Structure
```markdown
# Node Name

## Purpose
Brief explanation of what the node does.

## Parameters
Detailed parameter explanations.

## Examples
Practical usage examples.

## Tips & Troubleshooting
Common issues and solutions.
```

## Implementation Plan

1. **Phase 1**: Add tooltips to all high-priority nodes
2. **Phase 2**: Add DESCRIPTION fields to all nodes
3. **Phase 3**: Create detailed README files for complex nodes
4. **Phase 4**: Create overview documentation and usage guides

## Benefits

- **Improved User Experience**: Users can understand nodes without external documentation
- **Reduced Support Burden**: Self-documenting nodes reduce questions
- **Better Adoption**: Well-documented nodes are more likely to be used
- **Professional Appearance**: Comprehensive documentation shows quality and care
