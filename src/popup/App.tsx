import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import MetadataFetcher from './components/MetadataFetcher'
import GitHubPanel from './components/GitHubPanel'
import StoryViewer from './components/StoryViewer'
import { parseSacStory, type ParsedStoryContent } from './utils/sacParser'
import TopBar from './components/TopBar'
import SettingsModal from './components/SettingsModal'
import { useLanguagePreference } from './hooks/useLanguagePreference'
import './index.css'

function App() {
  const { t } = useTranslation();

  // Initialize language preference
  const { language, setLanguage } = useLanguagePreference();

  const [loading, setLoading] = useState(false)
  const [parsedContent, setParsedContent] = useState<ParsedStoryContent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [url, setUrl] = useState('');
  const [storyId, setStoryId] = useState('');
  const [storyName, setStoryName] = useState('');

  // UI State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // State to control visibility of heavy content
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);

  // Load state from storage on mount
  useEffect(() => {
    chrome.storage.local.get(['lastUrl', 'lastStoryId', 'lastStoryName'], (result) => {
      if (result.lastUrl) setUrl(result.lastUrl as string);
      if (result.lastStoryId) setStoryId(result.lastStoryId as string);
      if (result.lastStoryName) setStoryName(result.lastStoryName as string);
      setIsStorageLoaded(true);
    });
  }, []);

  // Save inputs to storage whenever they change
  useEffect(() => {
    if (isStorageLoaded) {
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
    <div className={`app-container ${isSettingsOpen ? 'modal-open' : ''}`}>
      <TopBar
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRefresh={isStoryLoaded ? handleRefresh : undefined}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentLanguage={language}
        onLanguageChange={setLanguage}
      />

      <main className="app-main">
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

        {isStoryLoaded && (
          <div className="content-stack">
            <StoryViewer content={parsedContent} onRefresh={handleRefresh} />
            <GitHubPanel parsedContent={parsedContent} />
          </div>
        )}
      </main>
    </div>
  )
}

export default App
