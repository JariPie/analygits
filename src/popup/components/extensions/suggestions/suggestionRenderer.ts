import { ReactRenderer } from '@tiptap/react';
import { autoUpdate, computePosition, offset, shift, size } from '@floating-ui/dom';
import type { VirtualElement } from '@floating-ui/dom';
import { SuggestionDropdown, type SuggestionDropdownRef } from './SuggestionDropdown';

const MAX_Z_INDEX = 2147483647;
const VIEWPORT_PADDING = 8;
const DROPDOWN_MAX_HEIGHT = 280;

export function createSuggestionRenderer() {
    let component: ReactRenderer<SuggestionDropdownRef> | null = null;
    let floatingEl: HTMLDivElement | null = null;
    let cleanup: (() => void) | null = null;

    // We store the virtual element persistently so we can update its rect
    // whenever the editor selection changes or autoUpdate triggers.
    const virtualEl: VirtualElement = {
        getBoundingClientRect: () => new DOMRect(0, 0, 0, 0),
        contextElement: undefined,
    };

    const getCaretRect = (editor: any): DOMRect | null => {
        try {
            const view = editor?.view;
            if (!view) return null;

            const pos = view.state.selection.from;
            const coords = view.coordsAtPos(pos);

            const width = Math.max(0, coords.right - coords.left);
            const height = Math.max(0, coords.bottom - coords.top);
            return new DOMRect(coords.left, coords.top, width, height);
        } catch {
            return null;
        }
    };

    const updatePosition = async (editor: any) => {
        if (!floatingEl) return;

        // update the virtual element rect based on current caret
        const rect = getCaretRect(editor);
        if (!rect) {
            floatingEl.style.visibility = 'hidden';
            return;
        }

        virtualEl.getBoundingClientRect = () => rect;
        virtualEl.contextElement = editor?.view?.dom;

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

        const { x, y } = await computePosition(virtualEl, floatingEl, {
            strategy: 'fixed',
            placement: 'bottom-start',
            middleware: [
                offset(4),
                shift({ padding: VIEWPORT_PADDING }),
                size({
                    padding: VIEWPORT_PADDING,
                    apply({ availableHeight, elements }) {
                        // Clamp max height to the smaller of viewport space or design max height
                        const maxH = Math.min(DROPDOWN_MAX_HEIGHT, Math.max(0, availableHeight - VIEWPORT_PADDING));
                        Object.assign(elements.floating.style, {
                            maxHeight: `${maxH}px`,
                            // Remove overflowY: 'auto' from here to prevent double scrollbars
                            // Scrolling should be handled by the inner container
                        });
                    },
                }),
            ],
        });

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

            // Ensure the React wrapper fills the container so inner scroll works
            if (component.element) {
                component.element.style.height = '100%';
            }

            floatingEl = document.createElement('div');
            floatingEl.setAttribute('data-suggestion-dropdown', 'true');
            // Add display: flex to ensure children can fill height properly
            floatingEl.style.cssText = `position: fixed; z-index: ${MAX_Z_INDEX}; left: 0; top: 0; will-change: transform; visibility: hidden; display: flex; flex-direction: column;`;

            floatingEl.appendChild(component.element as HTMLElement);
            document.body.appendChild(floatingEl);

            // 1. Initial position update
            // 2. Setup autoUpdate for scroll/resize
            const update = () => {
                updatePosition(props.editor);
            };

            // Run once immediately (async inside)
            update();

            // Start autoUpdate
            cleanup = autoUpdate(virtualEl, floatingEl, update, {
                animationFrame: true,
            });
        },

        onUpdate: (props: any) => {
            component?.updateProps({ items: props.items, command: props.command });
            // autoUpdate handles position, but we should update the specific rect
            // immediately in case the caret moved without scrolling
            updatePosition(props.editor);
        },

        onKeyDown: (props: { event: KeyboardEvent }) => {
            if (props.event.key === 'Escape') {
                cleanup?.();
                cleanup = null;
                floatingEl?.remove();
                component?.destroy();
                floatingEl = null;
                component = null;
                return true;
            }
            return component?.ref?.onKeyDown(props.event) ?? false;
        },

        onExit: () => {
            cleanup?.();
            cleanup = null;
            floatingEl?.remove();
            component?.destroy();
            floatingEl = null;
            component = null;
        },
    };
}
