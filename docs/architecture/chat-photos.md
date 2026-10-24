# Chat photos

The composer accepts PNG, JPEG, and WebP files from a picker, clipboard paste,
or drag and drop. Limits and validation live in `shared/images.ts`: four images,
5 MB per file, and 10 MB total decoded bytes per message. The messages endpoint
also caps JSON request bodies at 16 MB. The host validates the count, base64,
decoded size, and file signatures independently of the client.

Photo drafts are scoped to the conversation or new-project draft in memory.
They are not written to localStorage. Queued messages carry their own images.
The sender retains rejected uploads for correction and retries retain the
original image payloads.

Sent attachments are persisted inline in the local transcript JSON. The model
replay history retains image MIME types and base64 data; no external upload,
filesystem path, or remote image URL is involved. Editing message text preserves
its attached images and rebuilding legacy replay retains earlier photo turns.
The normal session deletion removes the images with the rest of that session.

The host passes the images through Poyraz's public `agent.chat()` options.
Provider-specific image conversion belongs in Poyraz; see its
[image input documentation](../../poyraz/docs/image-input.md). A vision-capable
model is required. Photo drafts are intentionally in-memory and are lost on
page reload; sent photos survive reopening the application.
