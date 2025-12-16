import { forwardRef, useEffect, useImperativeHandle, useState, useCallback } from 'react';
import './SuggestionDropdown.css';

export interface SuggestionItem {
    label: string;
    description?: string;
}

export interface SuggestionDropdownRef {
    onKeyDown: (event: KeyboardEvent) => boolean;
}

interface SuggestionDropdownProps {
    items: SuggestionItem[];
    command: (item: SuggestionItem) => void;
}

export const SuggestionDropdown = forwardRef<SuggestionDropdownRef, SuggestionDropdownProps>(
    ({ items, command }, ref) => {
        const [selectedIndex, setSelectedIndex] = useState(0);

        // Reset selection when items change
        useEffect(() => {
            setSelectedIndex(0);
        }, [items]);

        const selectItem = useCallback((index: number) => {
            const item = items[index];
            if (item) {
                command(item);
            }
        }, [items, command]);

        useImperativeHandle(ref, () => ({
            onKeyDown: (event: KeyboardEvent) => {
                if (event.key === 'ArrowUp') {
                    setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
                    return true;
                }

                if (event.key === 'ArrowDown') {
                    setSelectedIndex((prev) => (prev + 1) % items.length);
                    return true;
                }

                if (event.key === 'Enter') {
                    selectItem(selectedIndex);
                    return true;
                }

                return false;
            },
        }), [items.length, selectedIndex, selectItem]);

        if (items.length === 0) {
            return null;
        }

        return (
            <div className="suggestion-dropdown">
                {items.map((item, index) => (
                    <div
                        key={item.label}
                        className={`suggestion-item ${index === selectedIndex ? 'selected' : ''}`}
                        onClick={() => selectItem(index)}
                        onMouseEnter={() => setSelectedIndex(index)}
                    >
                        <span className="suggestion-label">{item.label}</span>
                        {item.description && (
                            <span className="suggestion-description">{item.description}</span>
                        )}
                    </div>
                ))}
            </div>
        );
    }
);

SuggestionDropdown.displayName = 'SuggestionDropdown';
