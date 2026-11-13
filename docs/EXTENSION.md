# BugKit MARK extension

The standalone Manifest V3 extension lives in `extension/`. It has no runtime dependencies, remote scripts, telemetry, account or backend. Its interface and exported agent instructions are Russian. Field names remain compatible with BugKit v1.

## Permissions

| Permission | Use |
|---|---|
| `activeTab` | Temporary page access after invocation; visible-tab screenshot on request |
| `scripting` | Inject `core.js` and `content.js` into the top frame |
| `storage` | Bounded drafts in `chrome.storage.session`, cleared on tab closure |
| `clipboardWrite` | Copy reviewed Markdown |

There are no host permissions or persistent content scripts. The logo's web-accessible declaration grants no page-reading access. Chrome's [activeTab documentation](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab) explains gestures and restrictions.

## Behavior

Up to five explicitly selected elements include a selector, XPath when available, tag, ID/classes, bounded visible text and viewport coordinates. Open Shadow DOM has a separate host chain. Form values, full HTML, hidden text and private-marked descendants are omitted. This cannot identify all sensitive content. URL credentials, queries and fragments are excluded; paths, DOM identifiers, text and screenshots may still disclose data.

Drafts are keyed by tab and a hash of the complete URL, including SPA routes. At most 20 drafts of at most 128 KiB each are retained in session storage. Screenshots remain in content-script memory. Closing a tab clears its drafts. Arbitrary-site logout is not detected: clear drafts before changing accounts. There is no cross-device sync or restore after the browser session ends.

Version/build values come from site metadata or manual input and are labelled as observations. The extension version is separate. JSON may embed PNG; Markdown refers to the separately saved PNG. Export executes no commands and contacts no AI service. Nonce-delimited data aids instruction separation but cannot guarantee immunity to prompt injection.

## Limits

- Internal Chrome pages, the Web Store and some viewers reject injection.
- Iframe contents and closed Shadow DOM are not inspected.
- Site capture handlers registered earlier can observe input before MARK.
- Clipboard access can fail; Markdown export and preview remain available.
- Capture rejects a tab/route change to avoid attaching a different page.
- GitHub installs require manual updates; no Chrome Web Store release is configured.
- Physical keyboard dispatch and macOS installation need manual verification.

The [demo](../demo/index.html) is synthetic. See [validation](../VALIDATION.md).
