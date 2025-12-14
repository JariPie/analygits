import { useState } from 'react'
import MetadataFetcher from './components/MetadataFetcher'
import Editor from './components/Editor'
import GitHubIntegration from './components/GitHubIntegration'
import { parseSacStory, formatStoryForGitHub, type ParsedStoryContent } from './utils/sacParser'
import './index.css'

function App() {
  const [loading, setLoading] = useState(false)
  const [editorContent, setEditorContent] = useState<string>('<p>Enter SAC Story URL to begin...</p>')
  const [parsedContent, setParsedContent] = useState<ParsedStoryContent | null>(null)
  const [error, setError] = useState<string | null>(null)
  // State to control visibility of heavy content
  const [showJson, setShowJson] = useState(false);

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
      <header className="app-header">
        <h1>SAP SAC Story Fetcher</h1>
        <p className="subtitle">Fetch and document SAC Stories</p>
      </header>

      <main>
        <div className="card">
          <MetadataFetcher onFetch={handleFetch} isLoading={loading} />
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
                  <pre className="json-viewer">
                    <code>{JSON.stringify(parsedContent?.content, null, 2)}</code>
                  </pre>
                </div>
              )}

              <GitHubIntegration
                defaultPath={`stories/${parsedContent?.name ? parsedContent.name.replace(/\s+/g, "_") : "story"}.md`}
                contentGenerator={() => formatStoryForGitHub(parsedContent!)}
              />
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
