import React from 'react';

interface MetadataFetcherProps {
    onFetch: (url: string, storyId?: string) => void;
    isLoading: boolean;
    url: string;
    storyId: string;
    onUrlChange: (url: string) => void;
    onStoryIdChange: (id: string) => void;
}

const MetadataFetcher: React.FC<MetadataFetcherProps> = ({
    onFetch,
    isLoading,
    url,
    storyId,
    onUrlChange,
    onStoryIdChange
}) => {
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
                        placeholder="https://.../services/rest/epm/contentlib?"
                        value={url}
                        onChange={(e) => onUrlChange(e.target.value)}
                        className="url-input"
                        disabled={isLoading}
                    />
                </div>
                <div className="input-group">
                    <input
                        type="text"
                        placeholder="Story ID (e.g. 83D8...)"
                        value={storyId}
                        onChange={(e) => onStoryIdChange(e.target.value)}
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
