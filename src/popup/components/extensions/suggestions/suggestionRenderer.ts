import { ReactRenderer } from '@tiptap/react';
import { computePosition, offset, shift, size } from '@floating-ui/dom';
import type { VirtualElement } from '@floating-ui/dom';
import { SuggestionDropdown, type SuggestionDropdownRef } from './SuggestionDropdown';

const MAX_Z_INDEX = 2147483647;
const VIEWPORT_PADDING = 8;

export function createSuggestionRenderer() {
    let component: ReactRenderer<SuggestionDropdownRef> | null = null;
    let floatingEl: HTMLDivElement | null = null;

    // Prevent async computePosition calls from applying out of order
    let positionSeq = 0;

    const getCaretRect = (editor: any): DOMRect | null => {
        try {
            const view = editor?.view;
            if (!view) return null;

            const pos = view.state.selection.from;
            const coords = view.coordsAtPos(pos);

            // coords are viewport-based already
            const width = Math.max(0, coords.right - coords.left);
            const height = Math.max(0, coords.bottom - coords.top);
            return new DOMRect(coords.left, coords.top, width, height);
        } catch {
            return null;
        }
    };

    const updatePosition = async (editor: any) => {
        if (!floatingEl) return;

        const rect = getCaretRect(editor);
        if (!rect) {
            floatingEl.style.visibility = 'hidden';
            return;
        }

        const visible =
            rect.bottom > 0 &&
            rect.top < window.innerHeight &&
            rect.right > 0 &&
            rect.left < window.innerWidth;

        if (!visible) {
            floatingEl.style.visibility = 'hidden';
            return;
        }

        floatingEl.style.visibility = 'visible';

        const virtualEl: VirtualElement = {
            getBoundingClientRect: () => rect,
            contextElement: editor?.view?.dom,
        };

        const seq = ++positionSeq;

        const { x, y } = await computePosition(virtualEl, floatingEl, {
            strategy: 'fixed',
            placement: 'bottom-start',
            middleware: [
                offset(4),
                // IMPORTANT: remove flip() to prevent “ping-pong” in a tight popup
                shift({ padding: VIEWPORT_PADDING }),
                size({
                    padding: VIEWPORT_PADDING,
                    apply({ availableHeight, elements }) {
                        Object.assign(elements.floating.style, {
                            maxHeight: `${Math.max(0, availableHeight - VIEWPORT_PADDING)}px`,
                            overflowY: 'auto',
                        });
                    },
                }),
            ],
        });

        // Ignore out-of-order async results
        if (seq !== positionSeq) return;

        Object.assign(floatingEl.style, {
            transform: `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`,
        });
    };

    return {
        onStart: (props: any) => {
            component = new ReactRenderer(SuggestionDropdown, {
                props: { items: props.items, command: props.command },
                editor: props.editor,
            });

            floatingEl = document.createElement('div');
            floatingEl.setAttribute('data-suggestion-dropdown', 'true');
            floatingEl.style.cssText = `position: fixed; z-index: ${MAX_Z_INDEX}; left: 0; top: 0; will-change: transform;`;
            floatingEl.style.visibility = 'hidden';

            floatingEl.appendChild(component.element as HTMLElement);
            document.body.appendChild(floatingEl);

            // Wait a frame so the dropdown has real dimensions before positioning
            requestAnimationFrame(() => updatePosition(props.editor));
        },

        onUpdate: (props: any) => {
            component?.updateProps({ items: props.items, command: props.command });
            requestAnimationFrame(() => updatePosition(props.editor));
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
