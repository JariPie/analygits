import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import MetadataFetcher from './components/MetadataFetcher'
import GitHubPanel from './components/GitHubPanel'
import GitHubStatusBadge from './components/GitHubStatusBadge'
import { parseSacStory, extractStoryDetails, type ParsedStoryContent } from './utils/sacParser'
import './index.css'

function App() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false)
  const [parsedContent, setParsedContent] = useState<ParsedStoryContent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [url, setUrl] = useState('');
  const [storyId, setStoryId] = useState('');
  const [storyName, setStoryName] = useState('');

  // State to control visibility of heavy content
  const [showJson, setShowJson] = useState(false);
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);

  // Load state from storage on mount
  useEffect(() => {
    chrome.storage.local.get(['parsedContent', 'lastUrl', 'lastStoryId', 'lastStoryName'], (result) => {
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
      if (result.lastUrl) setUrl(result.lastUrl as string);
      if (result.lastStoryId) setStoryId(result.lastStoryId as string);
      if (result.lastStoryName) setStoryName(result.lastStoryName as string);
      setIsStorageLoaded(true);
    });
  }, []);

  // Save inputs to storage whenever they change
  useEffect(() => {
    if (isStorageLoaded) {
      chrome.storage.local.set({ lastUrl: url, lastStoryId: storyId });
      chrome.storage.local.set({ lastUrl: url, lastStoryId: storyId, lastStoryName: storyName });
    }
  }, [url, storyId, storyName, isStorageLoaded]);

  // Save content to storage whenever it changes
  useEffect(() => {
    if (isStorageLoaded) {
      if (parsedContent) {
        chrome.storage.local.set({ parsedContent });
      }
    }
  }, [parsedContent, isStorageLoaded]);


  // Auto-detect SAC Story from current tab
  useEffect(() => {
    if (!isStorageLoaded) return;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (currentTab && currentTab.url) {
        const urlObj = new URL(currentTab.url);

        // Check for storyId in URL parameters
        let storyIdParam = urlObj.searchParams.get("storyId");

        // Check hash for modern SAC URL format
        if (!storyIdParam && urlObj.hash) {
          const hashMatch = urlObj.hash.match(/\/s2\/([A-Z0-9]+)/);
          if (hashMatch && hashMatch[1]) {
            storyIdParam = hashMatch[1];
          }
        }

        if (storyIdParam) {
          // Detect story name from tab title if available
          if (currentTab.title) {
            let cleanTitle = currentTab.title;
            cleanTitle = cleanTitle.replace(" - SAP Analytics Cloud", "");
            cleanTitle = cleanTitle.replace(" - Stories", "");
            cleanTitle = cleanTitle.trim();
            setStoryName(cleanTitle);
          }

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

  const handleFetch = async (fetchUrl: string, fetchStoryId?: string) => {
    setLoading(true)
    setError(null)
    setParsedContent(null)
    setShowJson(false) // Reset view

    try {
      let fetchOptions: any = { type: "FETCH_DATA", url: fetchUrl };

      if (fetchStoryId) {
        fetchOptions.method = "POST";
        fetchOptions.body = {
          "action": "getContent",
          "data": {
            "resourceType": "STORY",
            "resourceId": fetchStoryId,
            "oOpt": {
              "fetchDefaultBookmark": true,
              "sTranslationLocale": "en",
              "propertyBag": true,
              "presentationId": fetchStoryId,
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

    } catch (err: any) {
      console.error(err);
      setError(err.toString());
    } finally {
      setLoading(false)
    }
  }

  // Render logic variables
  const isStoryLoaded = !!parsedContent;
  const isDifferentStory = isStoryLoaded && storyId && parsedContent?.id !== storyId;

  const handleRefresh = () => {
    const customStoryId = isDifferentStory ? storyId : (parsedContent?.id || storyId);
    handleFetch(url, customStoryId);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <GitHubStatusBadge />
        <div className="header-content">
          <div className="header-center">
            <img src="/App_Text.png" alt="AnalyGits" className="app-logo" />
          </div>
        </div>
      </header>

      <main>
        {/* New Story Alert */}
        {isDifferentStory && (
          <div className="new-story-alert">
            <div className="new-story-info">
              {t('app.actions.newStoryDetected', { name: storyName || storyId })}
            </div>
            <button className="new-story-btn" onClick={() => handleFetch(url, storyId)}>
              {t('app.actions.fetchNewStory')}
            </button>
          </div>
        )}

        {/* Main Fetcher - Hide if loaded */}
        {(!isStoryLoaded) && (
          <div className="card">
            <MetadataFetcher
              onFetch={handleFetch}
              isLoading={loading}
              url={url}
              storyId={storyId}
              storyName={storyName}
            />
            {error && <div className="error-message">{error}</div>}
          </div>
        )}

        {/* Error when re-fetching/refreshing while loaded */}
        {isStoryLoaded && error && (
          <div className="card">
            <div className="error-message">{error}</div>
          </div>
        )}

        {parsedContent && (
          <div className="fadeIn">
            <div className="card">
              <div className="card-header">
                <h2>{t('app.storyFetchedSuccess')}</h2>
                <button className="refresh-btn" onClick={handleRefresh} title={t('app.actions.refresh')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 4v6h-6"></path>
                    <path d="M1 20v-6h6"></path>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                  </svg>
                  {t('app.actions.refresh')}
                </button>
              </div>
              <h2>{parsedContent?.name || t('app.storyFetchedDefault')}</h2>
              <p>{parsedContent?.description}</p>

              {parsedContent?.pages && parsedContent.pages.length > 0 && (
                <div style={{ marginTop: "1rem" }}>
                  <h3>{t('app.sections.pages', { count: parsedContent.pages.length })}</h3>
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
                  <h3>{t('app.sections.globalVars', { count: parsedContent.globalVars.length })}</h3>
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
                  <h3>{t('app.sections.scriptObjects', { count: parsedContent.scriptObjects.length })}</h3>
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
                  <h3>{t('app.sections.events', { count: parsedContent.events.length })}</h3>
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
                  {showJson ? t('app.actions.hideJson') : t('app.actions.showJson')}
                </button>
              </div>

              {showJson && (
                <div className="json-viewer-container">
                  <div style={{ padding: "10px", background: "#f0f0f0", marginBottom: "10px", borderRadius: "4px" }}>
                    <h4>{t('app.debug.title')}</h4>
                    <p><strong>{t('app.debug.pages')}</strong> {parsedContent?.pages?.length ?? 0}</p>
                    <p><strong>{t('app.debug.globalVars')}</strong> {parsedContent?.globalVars?.length ?? 0}</p>
                    <p><strong>{t('app.debug.scriptObjects')}</strong> {parsedContent?.scriptObjects?.length ?? 0}</p>
                    <p><strong>{t('app.debug.events')}</strong> {parsedContent?.events?.length ?? 0}</p>
                    <p><strong>{t('app.debug.entityKeys')}</strong> {parsedContent?.content?.entities ? Object.keys(parsedContent.content.entities).join(", ") : t('app.debug.noEntities')}</p>
                    <p><strong>{t('app.debug.isArray')}</strong> {Array.isArray(parsedContent?.content?.entities) ? t('common.yes') : t('common.no')}</p>
                  </div>
                  <pre className="json-viewer">
                    <code>{JSON.stringify(parsedContent?.content, null, 2)}</code>
                  </pre>
                </div>
              )}
            </div>

            <GitHubPanel parsedContent={parsedContent} />

          </div>
        )}
      </main>
    </div>
  )
}

export default App
