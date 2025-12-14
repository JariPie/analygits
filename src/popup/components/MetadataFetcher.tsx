import React, { useState } from 'react';

interface MetadataFetcherProps {
    onFetch: (url: string, storyId?: string) => void;
    isLoading: boolean;
    initialUrl?: string;
    initialStoryId?: string;
}

const MetadataFetcher: React.FC<MetadataFetcherProps> = ({ onFetch, isLoading, initialUrl = '', initialStoryId = '' }) => {
    const [url, setUrl] = useState(initialUrl);
    const [storyId, setStoryId] = useState(initialStoryId);

    React.useEffect(() => {
        if (initialUrl) setUrl(initialUrl);
        if (initialStoryId) setStoryId(initialStoryId);
    }, [initialUrl, initialStoryId]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (url) onFetch(url, storyId);
    };

    return (
        <div className="metadata-fetcher">
            <form onSubmit={handleSubmit} className="fetch-form">
                <div className="input-group">
                    <input
                        type="text"
                        placeholder="https://.../services/rest/epm/contentlib?tenant=5"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        className="url-input"
                        disabled={isLoading}
                    />
                </div>
                <div className="input-group">
                    <input
                        type="text"
                        placeholder="Story ID (e.g. 83D8...)"
                        value={storyId}
                        onChange={(e) => setStoryId(e.target.value)}
                        className="url-input"
                        disabled={isLoading}
                    />
                </div>
                <button type="submit" disabled={isLoading || !url} className="fetch-button">
                    {isLoading ? 'Fetching...' : 'Fetch Story'}
                </button>
            </form>
        </div>
    );
};

export default MetadataFetcher;
