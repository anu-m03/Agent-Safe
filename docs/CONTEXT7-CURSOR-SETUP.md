# Context7 MCP in Cursor (this project)

Context7 fetches **up-to-date library docs** into Cursor so the AI uses current APIs instead of outdated training data.

---

## 1. Project config (already added)

This repo has **project-level** MCP config at:

**`.cursor/mcp.json`**

It points to Context7’s remote server. You still need to add your API key (optional but recommended for higher rate limits).

---

## 2. Add your API key

1. Get a key: [context7.com/dashboard](https://context7.com/dashboard) (free tier available).
2. Edit **`.cursor/mcp.json`** in this project.
3. Replace `YOUR_API_KEY` with your key:
   ```json
   "CONTEXT7_API_KEY": "sk-..."
   ```
4. Save. Restart Cursor (or reload the window: `Cmd+Shift+P` → “Developer: Reload Window”) so MCP reloads.

**Without a key:** Context7 still works with lower rate limits. You can remove the `headers` block or leave the placeholder.

---

## 3. Use Context7 in prompts

In Cursor chat/composer, add **“use context7”** when you want current docs, e.g.:

- *“use context7 to show me how to set up middleware in Next.js 15”*
- *“use context7 for Prisma query examples with relations”*
- *“use context7 for the Supabase syntax for row-level security”*

With a library ID:

- *“use context7 with /vercel/next.js for app router setup”*
- *“use context7 with /supabase/supabase for authentication docs”*

---

## 4. Optional: global config instead of project

To have Context7 in **all** projects (and use a personal API key globally):

1. Open **Cursor Settings**: `Cursor` → `Settings...` → **Cursor Settings** → **MCP**  
   (or `Cmd+Shift+P` / `Ctrl+Shift+P` → “Cursor Settings”).
2. Click **“Add a Custom MCP Server”** or edit **`~/.cursor/mcp.json`**.
3. Paste the same structure as in `.cursor/mcp.json`, with your key in `CONTEXT7_API_KEY`.

Project-level `.cursor/mcp.json` in this repo only affects this project; global config affects every workspace.

---

## 5. Optional: auto-use via rules

To use Context7 automatically for library/docs questions (without typing “use context7” every time):

- **Cursor Settings** → **Rules and Commands** → add a rule, e.g.  
  *“Always use Context7 MCP when I ask about library documentation, API references, or code examples from external packages.”*

Or add a **`.cursorrules`** file in the project root with something like:

```
When the user asks about library APIs, framework setup, or code examples for external packages,
use Context7 MCP to fetch current documentation instead of relying on training data.
```

---

## Summary

| Step | Action |
|------|--------|
| Config | ✅ `.cursor/mcp.json` in this repo (Context7 remote server) |
| API key | Replace `YOUR_API_KEY` in `.cursor/mcp.json` (get from context7.com/dashboard) |
| Reload | Restart Cursor or Reload Window after editing MCP config |
| Use | In prompts, add “use context7” (or set up a rule / .cursorrules) |

No contract or app code was changed; only Cursor MCP config and this doc were added.
