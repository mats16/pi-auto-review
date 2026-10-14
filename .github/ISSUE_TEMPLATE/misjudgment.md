---
name: Misjudged call
about: pi-auto-review allowed a call that should have asked, or denied one that should have run. /auto-review-report in pi fills this in.
title: "Misjudged: "
labels: misjudgment
---

<!-- This issue is public: remove secrets, private paths, and internal names from the call before you submit it. -->

### What pi-auto-review decided

<!-- allowed or denied, its risk and authorization, whether the triage model or the reviewer decided, and its reason. With autoReview.log on, the line in ~/.pi/agent/pi-auto-review.jsonl has them all. -->

### Settings

- model: <!-- the reviewer, as provider/model-id -->
- effort: <!-- high unless you set another -->
- triage: <!-- off, or its model and confidence, and whether a custom endpoint is set (not the URL) -->

### What it should have done

<!-- And why: what you had asked for, if the reviewer misread it. -->

### Version

<!-- pi-auto-review's version (or commit), and your OS. -->

### The call

```json

```
