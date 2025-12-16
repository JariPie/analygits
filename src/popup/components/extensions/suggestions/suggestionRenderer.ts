import { ReactRenderer } from '@tiptap/react';
import { computePosition, flip, offset, shift } from '@floating-ui/dom';
import { SuggestionDropdown } from './SuggestionDropdown';
import type { SuggestionDropdownRef, SuggestionItem } from './SuggestionDropdown';

export interface SuggestionRenderProps {
    editor: any;
    clientRect: (() => DOMRect | null) | null;
    items: SuggestionItem[];
    command: (item: SuggestionItem) => void;
}

/**
 * Creates floating-ui-based rendering for TipTap suggestions
 * Replaces deprecated tippy.js approach
 */
export function createSuggestionRenderer() {
    let component: ReactRenderer<SuggestionDropdownRef> | null = null;
    let floatingEl: HTMLDivElement | null = null;

    const updatePosition = async (clientRect: (() => DOMRect | null) | null) => {
        if (!floatingEl || !clientRect) return;

        const rect = clientRect();
        if (!rect) return;

        // Create a virtual element for floating-ui
        const virtualEl = {
            getBoundingClientRect: () => rect,
        };

        const { x, y } = await computePosition(virtualEl, floatingEl, {
            placement: 'bottom-start',
            middleware: [
                offset(4),
                flip(),
                shift({ padding: 8 }),
            ],
        });

        Object.assign(floatingEl.style, {
            left: `${x}px`,
            top: `${y}px`,
        });
    };

    return {
        onStart: (props: SuggestionRenderProps) => {
            component = new ReactRenderer(SuggestionDropdown, {
                props: {
                    items: props.items,
                    command: props.command,
                },
                editor: props.editor,
            });

            // Create floating container
            floatingEl = document.createElement('div');
            floatingEl.style.cssText = 'position: fixed; z-index: 9999;';
            floatingEl.appendChild(component.element as HTMLElement);
            document.body.appendChild(floatingEl);

            updatePosition(props.clientRect);
        },

        onUpdate: (props: SuggestionRenderProps) => {
            component?.updateProps({
                items: props.items,
                command: props.command,
            });

            updatePosition(props.clientRect);
        },

        onKeyDown: (props: { event: KeyboardEvent }) => {
            if (props.event.key === 'Escape') {
                floatingEl?.remove();
                component?.destroy();
                floatingEl = null;
                component = null;
                return true;
            }

            return component?.ref?.onKeyDown(props.event) ?? false;
        },

        onExit: () => {
            floatingEl?.remove();
            component?.destroy();
            floatingEl = null;
            component = null;
        },
    };
}
