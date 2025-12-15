import { useState, useEffect } from 'react'
import MetadataFetcher from './components/MetadataFetcher'
import Editor from './components/Editor'
import GitHubPanel from './components/GitHubPanel'
import { parseSacStory, extractStoryDetails, type ParsedStoryContent } from './utils/sacParser'
import './index.css'

function App() {
  const [loading, setLoading] = useState(false)
  const [editorContent, setEditorContent] = useState<string>('<p>Enter SAC Story URL to begin...</p>')
  const [parsedContent, setParsedContent] = useState<ParsedStoryContent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [url, setUrl] = useState('');
  const [storyId, setStoryId] = useState('');

  // State to control visibility of heavy content
  const [showJson, setShowJson] = useState(false);
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);

  // Load state from storage on mount
  useEffect(() => {
    chrome.storage.local.get(['parsedContent', 'editorContent', 'lastUrl', 'lastStoryId'], (result) => {
      if (result.parsedContent) {
        // Hydrate the parsed content with potential new fields (e.g. scripts) derived from the content
        // This ensures that even if storage has old structure, we get the new details.
        const stored = result.parsedContent as ParsedStoryContent;
        if (stored.content) {
          const extraDetails = extractStoryDetails(stored.content);
          setParsedContent({ ...stored, ...extraDetails });
        } else {
          setParsedContent(stored);
        }
      }
      if (result.editorContent) setEditorContent(result.editorContent as string);
      if (result.lastUrl) setUrl(result.lastUrl as string);
      if (result.lastStoryId) setStoryId(result.lastStoryId as string);
      setIsStorageLoaded(true);
    });
  }, []);

  // Save inputs to storage whenever they change
  useEffect(() => {
    if (isStorageLoaded) {
      chrome.storage.local.set({ lastUrl: url, lastStoryId: storyId });
    }
  }, [url, storyId, isStorageLoaded]);

  // Save content to storage whenever it changes
  useEffect(() => {
    if (isStorageLoaded) {
      if (parsedContent) {
        chrome.storage.local.set({ parsedContent });
      }
      if (editorContent) {
        chrome.storage.local.set({ editorContent });
      }
    }
  }, [parsedContent, editorContent, isStorageLoaded]);


  // Auto-detect SAC Story from current tab - Only run after storage is loaded to verify if we need to override
  useEffect(() => {
    if (!isStorageLoaded) return;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (currentTab && currentTab.url) {
        const urlObj = new URL(currentTab.url);

        // Check for storyId in URL parameters
        let storyIdParam = urlObj.searchParams.get("storyId");

        // Check hash for modern SAC URL format: .../app.html#/story2&/s2/<ID>/?...
        if (!storyIdParam && urlObj.hash) {
          const hashMatch = urlObj.hash.match(/\/s2\/([A-Z0-9]+)/);
          if (hashMatch && hashMatch[1]) {
            storyIdParam = hashMatch[1];
          }
        }

        if (storyIdParam) {
          // Logic: Only update inputs if the detected ID is different from what we loaded/have.
          // This means if we are on Story B, and we have Story A stored, we update inputs to Story B.
          // But we don't necessarily clear the fetched content of Story A until the user clicks Fetch.
          setStoryId((prev) => {
            if (prev !== storyIdParam) {
              return storyIdParam || "";
            }
            return prev;
          });

          // Construct the Tenant URL
          const tenantId = urlObj.searchParams.get("tenant") || "5";
          const apiBase = `${urlObj.origin}/sap/fpa/services/rest/epm/contentlib?tenant=${tenantId}`;

          setUrl((prev) => {
            if (prev !== apiBase) {
              return apiBase;
            }
            return prev;
          });
        }
      }
    });
  }, [isStorageLoaded]);

  const handleFetch = async (url: string, storyId?: string) => {
    setLoading(true)
    setError(null)
    setParsedContent(null)
    setShowJson(false) // Reset view

    try {
      let fetchOptions: any = { type: "FETCH_DATA", url };

      // If Story ID is provided, we assume it's a POST request for SAC Story content
      if (storyId) {
        fetchOptions.method = "POST";
        fetchOptions.body = {
          "action": "getContent",
          "data": {
            "resourceType": "STORY",
            "resourceId": storyId,
            "oOpt": {
              "fetchDefaultBookmark": true,
              "sTranslationLocale": "en", // Defaulting to EN, can be made configurable
              "propertyBag": true,
              "presentationId": storyId,
              "isStory": true,
              "isStory2": true,
              "fetchTheme": true,
              "fetchComposite": true,
              "optimized": true
            },
            "bIncDependency": false
          }
        };
      }

      const response = await chrome.runtime.sendMessage(fetchOptions);

      if (!response.ok) {
        throw new Error(response.error);
      }

      const parsed = parseSacStory(response.data);
      setParsedContent(parsed);

      // Don't put the massive JSON in the Tiptap editor to avoid crashes
      setEditorContent(`
        <p><strong>Story Name:</strong> ${parsed.name}</p>
        <p><strong>Description:</strong> ${parsed.description}</p>
        <p><em>Add your notes here...</em></p>
      `);

      // Removed immediate generation of GitHub content to prevent freezing
      // const mdContent = formatStoryForGitHub(parsed);
      // setGithubContent(mdContent);

    } catch (err: any) {
      console.error(err);
      setError(err.toString());
      setEditorContent(`<p class="error">Error: ${err.message}</p>`);
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-container">
      <header className="app-header" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <img src="/AnalyGits.png" alt="AnalyGits Logo" style={{ height: "48px" }} />
          <h1 style={{ margin: 0 }}>AnalyGits</h1>
        </div>
        <p className="subtitle">Fetch and document SAC Stories</p>
      </header>

      <main>
        <div className="card">
          <MetadataFetcher
            onFetch={handleFetch}
            isLoading={loading}
            url={url}
            storyId={storyId}
            onUrlChange={setUrl}
            onStoryIdChange={setStoryId}
          />
          {error && <div className="error-message">{error}</div>}
        </div>

        {parsedContent && (
          <div className="fadeIn">
            <div className="card">
              <div className="card-header">
                <h2>Story Fetched Successfully!</h2>
              </div>
              <h2>{parsedContent?.name || "Story Fetched"}</h2>
              <p>{parsedContent?.description}</p>

              {parsedContent?.pages && parsedContent.pages.length > 0 && (
                <div style={{ marginTop: "1rem" }}>
                  <h3>Pages ({parsedContent.pages.length})</h3>
                  <ul style={{ maxHeight: "200px", overflowY: "auto", paddingLeft: "1.2rem" }}>
                    {parsedContent.pages.map(page => (
                      <li key={page.id}>
                        <strong>{page.title}</strong> <span style={{ fontSize: "0.8em", color: "#666" }}>({page.id})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {parsedContent?.globalVars && parsedContent.globalVars.length > 0 && (
                <div style={{ marginTop: "1rem" }}>
                  <h3>Global Variables ({parsedContent.globalVars.length})</h3>
                  <ul style={{ maxHeight: "150px", overflowY: "auto", paddingLeft: "1.2rem" }}>
                    {parsedContent.globalVars.map(gv => (
                      <li key={gv.id}>
                        <strong>{gv.name}</strong> ({gv.type})
                        {gv.description && <span style={{ display: "block", fontSize: "0.8em", color: "#666" }}>{gv.description}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {parsedContent?.scriptObjects && parsedContent.scriptObjects.length > 0 && (
                <div style={{ marginTop: "1rem" }}>
                  <h3>Script Objects ({parsedContent.scriptObjects.length})</h3>
                  <ul style={{ maxHeight: "150px", overflowY: "auto", paddingLeft: "1.2rem" }}>
                    {parsedContent.scriptObjects.map(so => (
                      <li key={so.id}>
                        <strong>{so.name}</strong>
                        <span style={{ fontSize: "0.8em", color: "#666" }}> - {so.functions.length} functions</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {parsedContent?.events && parsedContent.events.length > 0 && (
                <div style={{ marginTop: "1rem" }}>
                  <h3>Events ({parsedContent.events.length})</h3>
                  <ul style={{ maxHeight: "150px", overflowY: "auto", paddingLeft: "1.2rem" }}>
                    {parsedContent.events.map((evt, idx) => (
                      <li key={evt.widgetId + idx}>
                        <strong>{evt.widgetName}</strong> - {evt.eventName}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div style={{ marginTop: "1rem", display: "flex", gap: "10px" }}>
                <button
                  className="secondary-button"
                  onClick={() => setShowJson(!showJson)}
                >
                  {showJson ? "Hide Raw JSON" : "Show Raw JSON"}
                </button>
              </div>

              {showJson && (
                <div className="json-viewer-container">
                  <div style={{ padding: "10px", background: "#f0f0f0", marginBottom: "10px", borderRadius: "4px" }}>
                    <h4>Debug Info</h4>
                    <p><strong>Pages:</strong> {parsedContent?.pages?.length ?? 0}</p>
                    <p><strong>Global Vars:</strong> {parsedContent?.globalVars?.length ?? 0}</p>
                    <p><strong>Script Objects:</strong> {parsedContent?.scriptObjects?.length ?? 0}</p>
                    <p><strong>Events:</strong> {parsedContent?.events?.length ?? 0}</p>
                    <p><strong>Entity Keys:</strong> {parsedContent?.content?.entities ? Object.keys(parsedContent.content.entities).join(", ") : "No entities found"}</p>
                    <p><strong>Is Array?</strong> {Array.isArray(parsedContent?.content?.entities) ? "Yes" : "No"}</p>
                  </div>
                  <pre className="json-viewer">
                    <code>{JSON.stringify(parsedContent?.content, null, 2)}</code>
                  </pre>
                </div>
              )}

              <GitHubPanel parsedContent={parsedContent} />
            </div>

            <div className="card">
              <div className="card-header">
                <h2>User Notes</h2>
                {/* Export button could export combined content or just the story */}
              </div>
              <Editor content={editorContent} onChange={setEditorContent} />
            </div>


          </div>
        )}
      </main>
    </div>
  )
}

export default App
