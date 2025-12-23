import { useState, useEffect, useCallback } from 'react';

/**
 * Hook to manage state synchronized with chrome.storage.sys (or local fallback).
 * @param key The storage key
 * @param initialValue Default value if nothing in storage
 */
export function useChromeStorage<T>(key: string, initialValue: T) {
    const [storedValue, setStoredValue] = useState<T>(initialValue);
    const [isLoaded, setIsLoaded] = useState(false);

    // Helper to choose storage area (sync preferred, fallback to local)
    // Note: sync isn't always available (e.g. unauthenticated), but standard extensions use it.
    const storageArea = chrome.storage.sync || chrome.storage.local;

    useEffect(() => {
        storageArea.get([key], (result) => {
            // If the key exists in storage, use it. Otherwise keep initialValue.
            if (result && result[key] !== undefined) {
                setStoredValue(result[key] as T);
            }
            setIsLoaded(true);
        });
    }, [key, storageArea]);

    const setValue = useCallback((value: T | ((val: T) => T)) => {
        try {
            const valueToStore =
                value instanceof Function ? value(storedValue) : value;

            setStoredValue(valueToStore);

            storageArea.set({ [key]: valueToStore }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Error saving to storage:', chrome.runtime.lastError);
                }
            });
        } catch (error) {
            console.error(error);
        }
    }, [key, storedValue, storageArea]);

    return [storedValue, setValue, isLoaded] as const;
}
