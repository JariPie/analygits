import React, { useState } from 'react';

interface MetadataFetcherProps {
    onFetch: (url: string, storyId?: string) => void;
    isLoading: boolean;
}

const MetadataFetcher: React.FC<MetadataFetcherProps> = ({ onFetch, isLoading }) => {
    const [url, setUrl] = useState('');
    const [storyId, setStoryId] = useState('');

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
