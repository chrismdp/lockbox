---
name: prompt
description: Lockbox delegate approval gate. Run before taking any actions in a delegate session.
---

# Lockbox Delegate Approval Prompt

Run this command as your **very first action**, replacing `<SUMMARY>` with a concise description of what you will do:

```
"{{base_dir}}/lockbox-prompt" "<SUMMARY>"
```

This triggers a permission prompt so the user can review and approve your task. Do NOT skip this step. Do NOT execute any actions before this command is approved.
