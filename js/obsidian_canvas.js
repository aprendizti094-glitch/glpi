/**
 * Obsidian Canvas JavaScript Engine for GLPI
 * Fully interactive Canvas replicating Obsidian Canvas experience
 */

(function (window, document, $) {
    'use strict';

    class ObsidianCanvas {
        constructor(config) {
            this.rootDoc = config.rootDoc || '/glpi';
            this.kbId = config.kbId || 0;
            this.kbTitle = config.kbTitle || 'Canvas';

            this.viewport = document.getElementById('obsidian-viewport');
            this.nodesContainer = document.getElementById('obs-nodes-container');
            this.svgEdgesGroup = document.getElementById('obs-svg-edges');
            this.tempEdgePath = document.getElementById('obs-temp-edge');
            this.contextBar = document.getElementById('obs-node-context-bar');
            this.edgeContextBar = document.getElementById('obs-edge-context-bar');

            // Viewport transform state
            this.panX = 100;
            this.panY = 80;
            this.zoom = 1.0;
            this.minZoom = 0.15;
            this.maxZoom = 2.5;

            // Interaction state
            this.isPanning = false;
            this.panStartX = 0;
            this.panStartY = 0;
            this.spacePressed = false;

            this.draggedNode = null;
            this.dragOffsetX = 0;
            this.dragOffsetY = 0;

            this.resizingNode = null;
            this.resizeStartWidth = 0;
            this.resizeStartHeight = 0;
            this.resizeStartX = 0;
            this.resizeStartY = 0;

            this.connectingPort = null; // { nodeId, side, x, y }
            this.selectedNodeId = null;
            this.selectedEdgeId = null;

            // Canvas Data
            this.nodes = [];
            this.edges = [];
            this.saveTimeout = null;

            if (!this.viewport) {
                const self = this;
                let attempts = 0;
                const timer = setInterval(() => {
                    attempts++;
                    self.viewport = document.getElementById('obsidian-viewport');
                    if (self.viewport || attempts > 50) {
                        clearInterval(timer);
                        if (self.viewport) {
                            self.nodesContainer = document.getElementById('obs-nodes-container');
                            self.svgEdgesGroup = document.getElementById('obs-svg-edges');
                            self.tempEdgePath = document.getElementById('obs-temp-edge');
                            self.contextBar = document.getElementById('obs-node-context-bar');
                            self.edgeContextBar = document.getElementById('obs-edge-context-bar');
                            self.init();
                        }
                    }
                }, 50);
                return;
            }

            this.init();
        }

        init() {
            this.setupEvents();
            this.loadData();
        }

        setupEvents() {
            const self = this;
            if (!this.viewport) return;

            // Viewport Panning (Mouse Drag on canvas)
            this.viewport.addEventListener('mousedown', (e) => {
                if (e.target === self.viewport || e.target.id === 'obs-svg-layer') {
                    if (self.connectingPort && self.connectingPort.isClickMode) {
                        self.cancelConnecting();
                        return;
                    }

                    if (e.button === 0 || e.button === 1 || self.spacePressed) {
                        self.isPanning = true;
                        self.panStartX = e.clientX - self.panX;
                        self.panStartY = e.clientY - self.panY;
                        self.viewport.classList.add('is-dragging-canvas');
                        self.deselectAll();
                    }
                }
            });

            window.addEventListener('mousemove', (e) => {
                // Panning
                if (self.isPanning) {
                    self.panX = e.clientX - self.panStartX;
                    self.panY = e.clientY - self.panStartY;
                    self.applyTransform();
                    return;
                }

                // Dragging Node
                if (self.draggedNode) {
                    const canvasCoords = self.screenToCanvas(e.clientX, e.clientY);
                    self.draggedNode.x = canvasCoords.x - self.dragOffsetX;
                    self.draggedNode.y = canvasCoords.y - self.dragOffsetY;
                    self.updateNodeElement(self.draggedNode);
                    self.renderEdges();
                    self.positionContextBar(self.draggedNode);
                    return;
                }

                // Resizing Node
                if (self.resizingNode) {
                    const dx = (e.clientX - self.resizeStartX) / self.zoom;
                    const dy = (e.clientY - self.resizeStartY) / self.zoom;
                    self.resizingNode.width = Math.max(160, self.resizeStartWidth + dx);
                    self.resizingNode.height = Math.max(60, self.resizeStartHeight + dy);
                    self.updateNodeElement(self.resizingNode);
                    self.renderEdges();
                    self.positionContextBar(self.resizingNode);
                    return;
                }

                // Active Connection Edge (Dragging or Click-connecting)
                if (self.connectingPort) {
                    const dx = Math.abs(e.clientX - self.connectingPort.startX);
                    const dy = Math.abs(e.clientY - self.connectingPort.startY);
                    if (dx > 4 || dy > 4) {
                        self.connectingPort.hasMoved = true;
                    }

                    const canvasCoords = self.screenToCanvas(e.clientX, e.clientY);
                    const p1 = self.getPortCoordinates(self.connectingPort.nodeId, self.connectingPort.side);

                    // Check if hovering over candidate target node or port
                    let targetNode = null;
                    let targetSide = null;

                    const targetElem = document.elementFromPoint(e.clientX, e.clientY);
                    if (targetElem) {
                        if (targetElem.classList.contains('obs-port') && targetElem.dataset.nodeId !== self.connectingPort.nodeId) {
                            targetNode = self.nodes.find(n => n.id === targetElem.dataset.nodeId);
                            targetSide = targetElem.dataset.side;
                        } else {
                            const nodeEl = targetElem.closest('.obs-node');
                            if (nodeEl && nodeEl.dataset.nodeId !== self.connectingPort.nodeId) {
                                targetNode = self.nodes.find(n => n.id === nodeEl.dataset.nodeId);
                            }
                        }
                    }

                    // Fallback geometric detection near cursor
                    if (!targetNode) {
                        targetNode = self.getNodeAtCoords(canvasCoords.x, canvasCoords.y, 25);
                        if (targetNode && targetNode.id === self.connectingPort.nodeId) {
                            targetNode = null;
                        }
                    }

                    // Highlight hovered target node
                    document.querySelectorAll('.obs-node.connect-target').forEach(el => {
                        if (!targetNode || el.dataset.nodeId !== targetNode.id) {
                            el.classList.remove('connect-target');
                        }
                    });

                    let p2;
                    if (targetNode) {
                        const targetEl = document.getElementById('obs-node-' + targetNode.id);
                        if (targetEl) targetEl.classList.add('connect-target');
                        targetSide = targetSide || self.getBestTargetSide(targetNode, p1);
                        p2 = self.getPortCoordinates(targetNode.id, targetSide);
                    } else {
                        p2 = { x: canvasCoords.x, y: canvasCoords.y };
                    }

                    const d = self.calculateBezierPath(p1, p2, self.connectingPort.side, targetSide || 'auto');
                    self.tempEdgePath.setAttribute('d', d);
                    self.tempEdgePath.style.display = 'block';
                }
            });

            window.addEventListener('mouseup', (e) => {
                if (self.isPanning) {
                    self.isPanning = false;
                    self.viewport.classList.remove('is-dragging-canvas');
                }

                if (self.draggedNode || self.resizingNode) {
                    self.draggedNode = null;
                    self.resizingNode = null;
                    self.scheduleSave();
                }

                if (self.connectingPort) {
                    // If user only clicked the port without dragging, keep in click-to-connect mode
                    if (!self.connectingPort.hasMoved && !self.connectingPort.isClickMode) {
                        self.connectingPort.isClickMode = true;
                        return;
                    }

                    // Complete connection on mouseup
                    self.completeConnection(e.clientX, e.clientY);
                }
            });

            // Zoom (Mouse Wheel)
            this.viewport.addEventListener('wheel', (e) => {
                e.preventDefault();
                const zoomFactor = 1.08;
                const oldZoom = self.zoom;
                let newZoom = e.deltaY < 0 ? oldZoom * zoomFactor : oldZoom / zoomFactor;
                newZoom = Math.min(Math.max(newZoom, self.minZoom), self.maxZoom);

                const rect = self.viewport.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                // Zoom centered around mouse pointer
                self.panX = mouseX - (mouseX - self.panX) * (newZoom / oldZoom);
                self.panY = mouseY - (mouseY - self.panY) * (newZoom / oldZoom);
                self.zoom = newZoom;

                self.applyTransform();
            }, { passive: false });

            // Spacebar Panning toggle & Delete / Escape keys
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    if (self.connectingPort) {
                        self.cancelConnecting();
                        return;
                    }
                }
                if (e.code === 'Space' && !e.target.matches('input, textarea, [contenteditable="true"]')) {
                    self.spacePressed = true;
                    self.viewport.style.cursor = 'grab';
                }
                if ((e.key === 'Delete' || e.key === 'Backspace') && !e.target.matches('input, textarea, [contenteditable="true"]')) {
                    if (self.selectedNodeId) {
                        self.deleteNode(self.selectedNodeId);
                    } else if (self.selectedEdgeId) {
                        self.deleteEdge(self.selectedEdgeId);
                    }
                }
            });

            window.addEventListener('keyup', (e) => {
                if (e.code === 'Space') {
                    self.spacePressed = false;
                    self.viewport.style.cursor = '';
                }
            });

            // Double Click on Canvas Background -> Create Card
            this.viewport.addEventListener('dblclick', (e) => {
                if (e.target === self.viewport || e.target.id === 'obs-svg-layer') {
                    const canvasCoords = self.screenToCanvas(e.clientX, e.clientY);
                    self.addNode({
                        type: 'text',
                        title: 'Nota',
                        content: 'Escreva sua anotação...',
                        x: canvasCoords.x - 100,
                        y: canvasCoords.y - 40,
                        width: 220,
                        height: 100,
                        color: 'default'
                    });
                }
            });

            // Paste Event (Support pasting text or image directly onto canvas)
            window.addEventListener('paste', (e) => {
                const items = (e.clipboardData || e.originalEvent.clipboardData).items;
                for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                        const blob = items[i].getAsFile();
                        const reader = new FileReader();
                        reader.onload = function (event) {
                            const base64 = event.target.result;
                            self.uploadPastedImage(base64);
                        };
                        reader.readAsDataURL(blob);
                        e.preventDefault();
                        return;
                    }
                }
            });

            // Helper to bind events safely
            const safeOn = (id, event, handler) => {
                const el = document.getElementById(id);
                if (el) el.addEventListener(event, handler);
            };

            // Bottom Toolbar Buttons
            safeOn('obs-tool-card', 'click', () => {
                const center = self.getViewportCenter();
                self.addNode({
                    type: 'text',
                    title: 'Nota de Tarefa',
                    content: 'Nova tarefa a realizar...',
                    x: center.x - 100,
                    y: center.y - 50,
                    width: 220,
                    height: 110,
                    color: 'green'
                });
            });

            safeOn('obs-tool-markdown', 'click', () => {
                const center = self.getViewportCenter();
                self.addNode({
                    type: 'markdown',
                    title: 'Documento',
                    content: '## Resumo do Problema\n- Detalhe 1\n- Detalhe 2',
                    x: center.x - 120,
                    y: center.y - 60,
                    width: 260,
                    height: 140,
                    color: 'default'
                });
            });

            safeOn('obs-tool-image', 'click', () => {
                const input = document.getElementById('obs-file-input');
                if (input) input.click();
            });

            safeOn('obs-file-input', 'change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    const file = e.target.files[0];
                    const reader = new FileReader();
                    reader.onload = function (event) {
                        self.uploadPastedImage(event.target.result, file.name);
                    };
                    reader.readAsDataURL(file);
                }
            });

            // Right Toolbar Actions (Zoom & Reset)
            safeOn('obs-zoom-in', 'click', () => {
                self.zoomBy(1.2);
            });

            safeOn('obs-zoom-out', 'click', () => {
                self.zoomBy(1 / 1.2);
            });

            safeOn('obs-zoom-reset', 'click', () => {
                self.zoom = 1.0;
                self.panX = 80;
                self.panY = 80;
                self.applyTransform();
            });

            safeOn('obs-zoom-fit', 'click', () => {
                self.fitAllNodes();
            });

            safeOn('obs-tool-help', 'click', () => {
                const modal = document.getElementById('obs-help-modal');
                if (modal) modal.style.display = 'flex';
            });

            safeOn('obs-help-close', 'click', () => {
                const modal = document.getElementById('obs-help-modal');
                if (modal) modal.style.display = 'none';
            });

            // Context Bar Actions (Colors & Delete)
            if (this.contextBar) {
                this.contextBar.querySelectorAll('.obs-color-dot').forEach((dot) => {
                    dot.addEventListener('click', () => {
                        if (self.selectedNodeId) {
                            const color = dot.dataset.color;
                            self.setNodeColor(self.selectedNodeId, color);
                        }
                    });
                });
            }

            safeOn('obs-ctx-connect', 'click', () => {
                if (self.selectedNodeId) {
                    self.startNodeConnecting(self.selectedNodeId);
                }
            });

            safeOn('obs-connect-cancel', 'click', () => {
                self.cancelConnecting();
            });

            safeOn('obs-edge-btn-delete', 'click', (e) => {
                e.stopPropagation();
                if (self.selectedEdgeId) {
                    self.deleteEdge(self.selectedEdgeId);
                }
            });

            safeOn('obs-edge-btn-flip', 'click', (e) => {
                e.stopPropagation();
                if (self.selectedEdgeId) {
                    self.flipEdge(self.selectedEdgeId);
                }
            });

            safeOn('obs-ctx-delete', 'click', () => {
                if (self.selectedNodeId) {
                    self.deleteNode(self.selectedNodeId);
                }
            });

            safeOn('obs-ctx-duplicate', 'click', () => {
                if (self.selectedNodeId) {
                    self.duplicateNode(self.selectedNodeId);
                }
            });

            // Topbar buttons
            safeOn('obs-btn-fullscreen', 'click', () => {
                const root = document.getElementById('obsidian-canvas-root');
                if (!root) return;
                if (!document.fullscreenElement) {
                    root.requestFullscreen().catch(err => alert(err.message));
                } else {
                    document.exitFullscreen();
                }
            });
        }

        screenToCanvas(clientX, clientY) {
            const rect = this.viewport.getBoundingClientRect();
            return {
                x: (clientX - rect.left - this.panX) / this.zoom,
                y: (clientY - rect.top - this.panY) / this.zoom
            };
        }

        getViewportCenter() {
            const rect = this.viewport.getBoundingClientRect();
            return {
                x: (rect.width / 2 - this.panX) / this.zoom,
                y: (rect.height / 2 - this.panY) / this.zoom
            };
        }

        applyTransform() {
            if (!this.viewport || !this.nodesContainer) return;
            if (!isFinite(this.panX)) this.panX = 80;
            if (!isFinite(this.panY)) this.panY = 80;
            if (!isFinite(this.zoom) || this.zoom <= 0) this.zoom = 1.0;

            const transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
            if (this.nodesContainer) this.nodesContainer.style.transform = transform;
            if (this.svgEdgesGroup) this.svgEdgesGroup.style.transform = transform;
            if (this.tempEdgePath) this.tempEdgePath.style.transform = transform;

            // Adjust grid background offset & scale
            const bgX = this.panX % (20 * this.zoom);
            const bgY = this.panY % (20 * this.zoom);
            const bgSize = 20 * this.zoom;
            this.viewport.style.backgroundPosition = `${bgX}px ${bgY}px`;
            this.viewport.style.backgroundSize = `${bgSize}px ${bgSize}px`;

            if (this.selectedNodeId) {
                const node = this.nodes.find(n => n.id === this.selectedNodeId);
                if (node) this.positionContextBar(node);
            }
        }

        zoomBy(factor) {
            const rect = this.viewport.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const oldZoom = this.zoom;
            let newZoom = Math.min(Math.max(oldZoom * factor, this.minZoom), this.maxZoom);

            this.panX = centerX - (centerX - this.panX) * (newZoom / oldZoom);
            this.panY = centerY - (centerY - this.panY) * (newZoom / oldZoom);
            this.zoom = newZoom;
            this.applyTransform();
        }

        fitAllNodes() {
            if (this.nodes.length === 0) return;

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            this.nodes.forEach(n => {
                minX = Math.min(minX, n.x);
                minY = Math.min(minY, n.y);
                maxX = Math.max(maxX, n.x + n.width);
                maxY = Math.max(maxY, n.y + n.height);
            });

            const padding = 80;
            const rect = this.viewport.getBoundingClientRect();
            const contentW = maxX - minX + padding * 2;
            const contentH = maxY - minY + padding * 2;

            const scaleX = rect.width / contentW;
            const scaleY = rect.height / contentH;
            this.zoom = Math.min(Math.max(Math.min(scaleX, scaleY), this.minZoom), 1.2);

            this.panX = (rect.width - (maxX + minX) * this.zoom) / 2;
            this.panY = (rect.height - (maxY + minY) * this.zoom) / 2;

            this.applyTransform();
        }

        addNode(nodeData) {
            const node = {
                id: 'node_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                type: nodeData.type || 'text',
                title: nodeData.title || '',
                content: nodeData.content || '',
                imageUrl: nodeData.imageUrl || '',
                x: nodeData.x || 100,
                y: nodeData.y || 100,
                width: nodeData.width || 220,
                height: nodeData.height || 100,
                color: nodeData.color || 'default'
            };

            this.nodes.push(node);
            this.createNodeElement(node);
            this.selectNode(node.id);
            this.updateStatus();
            this.scheduleSave();
            return node;
        }

        createNodeElement(node) {
            const self = this;
            const el = document.createElement('div');
            el.id = 'obs-node-' + node.id;
            el.className = `obs-node color-${node.color}`;
            el.dataset.nodeId = node.id;

            // Header
            const header = document.createElement('div');
            header.className = 'obs-node-header';

            const title = document.createElement('div');
            title.className = 'obs-node-title';
            title.textContent = node.title || (node.type === 'image' ? 'Imagem' : 'Nota');
            title.contentEditable = true;
            title.addEventListener('blur', () => {
                node.title = title.textContent.trim();
                self.scheduleSave();
            });
            header.appendChild(title);

            // Body
            const body = document.createElement('div');
            body.className = 'obs-node-body';

            if (node.type === 'image') {
                body.className += ' obs-node-image-wrap';
                const img = document.createElement('img');
                img.src = node.imageUrl;
                img.alt = node.title;
                body.appendChild(img);
            } else {
                body.contentEditable = true;
                const safeContent = node.content != null ? String(node.content) : '';
                body.innerHTML = safeContent.replace(/\n/g, '<br>');
                body.addEventListener('blur', () => {
                    node.content = body.innerText;
                    self.scheduleSave();
                });
            }

            el.appendChild(header);
            el.appendChild(body);

            // Anchor Ports (Top, Right, Bottom, Left)
            ['top', 'right', 'bottom', 'left'].forEach((side) => {
                const port = document.createElement('div');
                port.className = `obs-port port-${side}`;
                port.dataset.nodeId = node.id;
                port.dataset.side = side;

                port.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    // If already connecting from another port/node, complete connection to this port
                    if (self.connectingPort) {
                        if (node.id !== self.connectingPort.nodeId) {
                            self.addEdge(self.connectingPort.nodeId, self.connectingPort.side || 'bottom', node.id, side);
                        }
                        self.cancelConnecting();
                        return;
                    }

                    self.connectingPort = {
                        nodeId: node.id,
                        side: side,
                        startX: e.clientX,
                        startY: e.clientY,
                        hasMoved: false,
                        isClickMode: false
                    };
                    self.viewport.classList.add('is-connecting');
                    el.classList.add('is-source-connecting');
                    self.showConnectBanner(node.title || 'este card');
                });
                el.appendChild(port);
            });

            // Card Click in connect mode
            el.addEventListener('click', (e) => {
                if (self.connectingPort) {
                    if (node.id !== self.connectingPort.nodeId) {
                        const p1 = self.getPortCoordinates(self.connectingPort.nodeId, self.connectingPort.side || 'bottom');
                        const bestSide = self.getBestTargetSide(node, p1);
                        self.addEdge(self.connectingPort.nodeId, self.connectingPort.side || 'bottom', node.id, bestSide);
                    }
                    self.cancelConnecting();
                    e.stopPropagation();
                }
            });

            // Resize Handle (Bottom Right)
            const handleBR = document.createElement('div');
            handleBR.className = 'obs-resize-handle handle-br';
            handleBR.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                self.resizingNode = node;
                self.resizeStartWidth = node.width;
                self.resizeStartHeight = node.height;
                self.resizeStartX = e.clientX;
                self.resizeStartY = e.clientY;
            });
            el.appendChild(handleBR);

            // Node Selection & Dragging
            el.addEventListener('mousedown', (e) => {
                if (e.target.classList.contains('obs-port') || e.target.classList.contains('obs-resize-handle')) {
                    return;
                }
                // If in connect mode and user clicks another card, connect them!
                if (self.connectingPort) {
                    if (node.id !== self.connectingPort.nodeId) {
                        const p1 = self.getPortCoordinates(self.connectingPort.nodeId, self.connectingPort.side || 'bottom');
                        const bestSide = self.getBestTargetSide(node, p1);
                        self.addEdge(self.connectingPort.nodeId, self.connectingPort.side || 'bottom', node.id, bestSide);
                    }
                    self.cancelConnecting();
                    e.stopPropagation();
                    return;
                }

                // Alt + Drag: quick connection from card
                if (e.altKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    self.connectingPort = {
                        nodeId: node.id,
                        side: 'bottom',
                        startX: e.clientX,
                        startY: e.clientY,
                        hasMoved: true,
                        isClickMode: false
                    };
                    self.viewport.classList.add('is-connecting');
                    el.classList.add('is-source-connecting');
                    self.showConnectBanner(node.title || 'este card');
                    return;
                }

                e.stopPropagation();
                self.selectNode(node.id);

                if (!e.target.isContentEditable) {
                    self.draggedNode = node;
                    const canvasCoords = self.screenToCanvas(e.clientX, e.clientY);
                    self.dragOffsetX = canvasCoords.x - node.x;
                    self.dragOffsetY = canvasCoords.y - node.y;
                }
            });

            this.nodesContainer.appendChild(el);
            this.updateNodeElement(node);
        }

        updateNodeElement(node) {
            const el = document.getElementById('obs-node-' + node.id);
            if (!el) return;

            el.style.left = node.x + 'px';
            el.style.top = node.y + 'px';
            el.style.width = node.width + 'px';
            el.style.height = node.height + 'px';

            el.className = `obs-node color-${node.color}${this.selectedNodeId === node.id ? ' selected' : ''}`;
        }

        selectNode(nodeId) {
            this.deselectAll();
            this.selectedNodeId = nodeId;
            const node = this.nodes.find(n => n.id === nodeId);
            if (node) {
                const el = document.getElementById('obs-node-' + nodeId);
                if (el) el.classList.add('selected');
                this.positionContextBar(node);
            }
        }

        deselectAll() {
            this.selectedNodeId = null;
            this.selectedEdgeId = null;
            document.querySelectorAll('.obs-node.selected').forEach(el => el.classList.remove('selected'));
            document.querySelectorAll('.obs-edge-group.selected, .obs-edge-path.selected').forEach(el => el.classList.remove('selected'));
            if (this.contextBar) this.contextBar.style.display = 'none';
            if (this.edgeContextBar) this.edgeContextBar.style.display = 'none';
        }

        selectEdge(edgeId, clientX = null, clientY = null) {
            this.deselectAll();
            this.selectedEdgeId = edgeId;
            const group = document.getElementById('obs-edge-' + edgeId);
            if (group) {
                group.classList.add('selected');
            }
            this.positionEdgeContextBar(edgeId, clientX, clientY);
        }

        positionEdgeContextBar(edgeId, clientX = null, clientY = null) {
            if (!this.edgeContextBar) {
                this.edgeContextBar = document.getElementById('obs-edge-context-bar');
            }
            if (!this.edgeContextBar) return;
            const edge = this.edges.find(e => e.id === edgeId);
            if (!edge) return;

            const rootRect = this.viewport.getBoundingClientRect();
            let screenX, screenY;

            if (clientX !== null && clientY !== null) {
                // Place mini pop-up right beside the cursor position
                screenX = clientX - rootRect.left + 14;
                screenY = clientY - rootRect.top - 8;
            } else {
                const p1 = this.getPortCoordinates(edge.fromNode, edge.fromSide, edge.id);
                const p2 = this.getPortCoordinates(edge.toNode, edge.toSide, edge.id);
                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;
                screenX = midX * this.zoom + this.panX + 14;
                screenY = midY * this.zoom + this.panY - 8;
            }

            // Boundary checks to ensure pop-up stays within visible canvas
            const menuWidth = 185;
            const menuHeight = 90;
            if (screenX + menuWidth > rootRect.width - 12) {
                screenX = (clientX !== null ? clientX - rootRect.left - menuWidth - 14 : rootRect.width - menuWidth - 12);
            }
            if (screenY + menuHeight > rootRect.height - 12) {
                screenY = rootRect.height - menuHeight - 12;
            }
            if (screenX < 10) screenX = 10;
            if (screenY < 10) screenY = 10;

            this.edgeContextBar.style.left = screenX + 'px';
            this.edgeContextBar.style.top = screenY + 'px';
            this.edgeContextBar.style.display = 'flex';
        }

        flipEdge(edgeId) {
            const edge = this.edges.find(e => e.id === edgeId);
            if (!edge) return;
            const tempNode = edge.fromNode;
            const tempSide = edge.fromSide;
            edge.fromNode = edge.toNode;
            edge.fromSide = edge.toSide;
            edge.toNode = tempNode;
            edge.toSide = tempSide;

            this.renderEdges();
            this.scheduleSave();
            this.selectEdge(edge.id);
        }

        positionContextBar(node) {
            const screenX = node.x * this.zoom + this.panX + (node.width * this.zoom) / 2;
            const screenY = node.y * this.zoom + this.panY - 48;

            this.contextBar.style.left = screenX + 'px';
            this.contextBar.style.top = screenY + 'px';
            this.contextBar.style.display = 'flex';

            // Update active color dot
            this.contextBar.querySelectorAll('.obs-color-dot').forEach(dot => {
                dot.classList.toggle('active', dot.dataset.color === (node.color || 'default'));
            });
        }

        setNodeColor(nodeId, color) {
            const node = this.nodes.find(n => n.id === nodeId);
            if (node) {
                node.color = color;
                this.updateNodeElement(node);
                this.positionContextBar(node);
                this.renderEdges();
                this.scheduleSave();
            }
        }

        duplicateNode(nodeId) {
            const node = this.nodes.find(n => n.id === nodeId);
            if (node) {
                this.addNode({
                    type: node.type,
                    title: node.title,
                    content: node.content,
                    imageUrl: node.imageUrl,
                    x: node.x + 30,
                    y: node.y + 30,
                    width: node.width,
                    height: node.height,
                    color: node.color
                });
            }
        }

        deleteNode(nodeId) {
            this.nodes = this.nodes.filter(n => n.id !== nodeId);
            this.edges = this.edges.filter(e => e.fromNode !== nodeId && e.toNode !== nodeId);

            const el = document.getElementById('obs-node-' + nodeId);
            if (el) el.remove();

            this.deselectAll();
            this.renderEdges();
            this.updateStatus();
            this.scheduleSave();
        }

        // Node geometric collision helper for connection target detection
        getNodeAtCoords(canvasX, canvasY, padding = 20) {
            return this.nodes.find(n => {
                return (
                    canvasX >= n.x - padding &&
                    canvasX <= n.x + n.width + padding &&
                    canvasY >= n.y - padding &&
                    canvasY <= n.y + n.height + padding
                );
            });
        }

        // Calculate the closest target port side facing the source
        getBestTargetSide(targetNode, sourcePoint) {
            const ports = {
                top: { x: targetNode.x + targetNode.width / 2, y: targetNode.y },
                bottom: { x: targetNode.x + targetNode.width / 2, y: targetNode.y + targetNode.height },
                left: { x: targetNode.x, y: targetNode.y + targetNode.height / 2 },
                right: { x: targetNode.x + targetNode.width, y: targetNode.y + targetNode.height / 2 }
            };

            let bestSide = 'left';
            let minDistance = Infinity;

            for (const [side, p] of Object.entries(ports)) {
                const dist = Math.hypot(p.x - sourcePoint.x, p.y - sourcePoint.y);
                if (dist < minDistance) {
                    minDistance = dist;
                    bestSide = side;
                }
            }

            return bestSide;
        }

        // Complete connection creation
        completeConnection(clientX, clientY) {
            if (!this.connectingPort) return;

            const canvasCoords = this.screenToCanvas(clientX, clientY);
            const p1 = this.getPortCoordinates(this.connectingPort.nodeId, this.connectingPort.side || 'bottom');

            let targetNode = null;
            let targetSide = null;

            const targetElem = document.elementFromPoint(clientX, clientY);
            if (targetElem) {
                if (targetElem.classList.contains('obs-port') && targetElem.dataset.nodeId !== this.connectingPort.nodeId) {
                    targetNode = this.nodes.find(n => n.id === targetElem.dataset.nodeId);
                    targetSide = targetElem.dataset.side;
                } else {
                    const nodeEl = targetElem.closest('.obs-node');
                    if (nodeEl) {
                        const targetId = nodeEl.dataset.nodeId || nodeEl.id.replace('obs-node-', '');
                        if (targetId !== this.connectingPort.nodeId) {
                            targetNode = this.nodes.find(n => n.id === targetId);
                        }
                    }
                }
            }

            if (!targetNode) {
                targetNode = this.getNodeAtCoords(canvasCoords.x, canvasCoords.y, 45);
                if (targetNode && targetNode.id === this.connectingPort.nodeId) {
                    targetNode = null;
                }
            }

            if (targetNode && targetNode.id !== this.connectingPort.nodeId) {
                targetSide = targetSide || this.getBestTargetSide(targetNode, p1);
                this.addEdge(this.connectingPort.nodeId, this.connectingPort.side || 'bottom', targetNode.id, targetSide);
            } else if (this.connectingPort.hasMoved) {
                // FEATURE 1: Dropped onto empty canvas -> Create new card automatically!
                const dist = Math.hypot(clientX - this.connectingPort.startX, clientY - this.connectingPort.startY);
                if (dist > 30) {
                    const newCard = this.addNode({
                        type: 'text',
                        title: 'Nota de Tarefa',
                        content: '',
                        x: Math.round(canvasCoords.x - 110),
                        y: Math.round(canvasCoords.y - 45),
                        width: 220,
                        height: 100,
                        color: 'default'
                    });

                    const bestSide = this.getBestTargetSide(newCard, p1);
                    this.addEdge(this.connectingPort.nodeId, this.connectingPort.side || 'bottom', newCard.id, bestSide);

                    setTimeout(() => {
                        const el = document.getElementById('obs-node-' + newCard.id);
                        if (el) {
                            const body = el.querySelector('.obs-node-body');
                            if (body) {
                                body.focus();
                            }
                        }
                    }, 60);
                }
            }

            this.cancelConnecting();
        }

        startNodeConnecting(nodeId) {
            const node = this.nodes.find(n => n.id === nodeId);
            if (!node) return;

            this.deselectAll();
            this.connectingPort = {
                nodeId: nodeId,
                side: 'bottom',
                startX: 0,
                startY: 0,
                hasMoved: true,
                isClickMode: true
            };
            this.viewport.classList.add('is-connecting');
            const el = document.getElementById('obs-node-' + nodeId);
            if (el) el.classList.add('is-source-connecting');
            this.showConnectBanner(node.title || 'este card');
        }

        showConnectBanner(cardTitle) {
            const banner = document.getElementById('obs-connect-banner');
            const bannerText = document.getElementById('obs-connect-banner-text');
            if (banner && bannerText) {
                bannerText.textContent = `Conectando "${cardTitle}": clique ou arraste até outro card para criar o link`;
                banner.style.display = 'flex';
            }
        }

        // Cancel connection state and reset visuals
        cancelConnecting() {
            this.connectingPort = null;
            if (this.tempEdgePath) {
                this.tempEdgePath.style.display = 'none';
                this.tempEdgePath.removeAttribute('d');
            }
            if (this.viewport) {
                this.viewport.classList.remove('is-connecting');
            }
            const banner = document.getElementById('obs-connect-banner');
            if (banner) banner.style.display = 'none';
            document.querySelectorAll('.is-source-connecting').forEach(el => el.classList.remove('is-source-connecting'));
            document.querySelectorAll('.obs-node.connect-target').forEach(el => el.classList.remove('connect-target'));
        }

        // Connectors (Edges)
        addEdge(fromNodeId, fromSide, toNodeId, toSide) {
            if (fromNodeId === toNodeId) return;

            // Check if exact same edge already exists between these two specific nodes and sides
            const exists = this.edges.some(e =>
                e.fromNode === fromNodeId &&
                e.toNode === toNodeId &&
                e.fromSide === (fromSide || 'bottom') &&
                e.toSide === (toSide || 'top')
            );
            if (exists) return;

            const edge = {
                id: 'edge_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                fromNode: fromNodeId,
                fromSide: fromSide || 'bottom',
                toNode: toNodeId,
                toSide: toSide || 'top'
            };

            this.edges.push(edge);
            this.renderEdges();
            this.updateStatus();
            this.scheduleSave();
        }

        deleteEdge(edgeId) {
            this.edges = this.edges.filter(e => e.id !== edgeId);
            this.deselectAll();
            this.renderEdges();
            this.updateStatus();
            this.scheduleSave();
        }

        getPortCoordinates(nodeId, side, edgeId = null) {
            const node = this.nodes.find(n => n.id === nodeId);
            if (!node) return { x: 0, y: 0 };

            let baseX = node.x + node.width / 2;
            let baseY = node.y + node.height / 2;

            if (side === 'top') {
                baseY = node.y;
            } else if (side === 'bottom') {
                baseY = node.y + node.height;
            } else if (side === 'left') {
                baseX = node.x;
            } else if (side === 'right') {
                baseX = node.x + node.width;
            }

            // Offset multiple edges connected to the same side so they fan out neatly without overlapping
            if (edgeId) {
                const sameSideEdges = this.edges.filter(e =>
                    (e.fromNode === nodeId && (e.fromSide || 'bottom') === (side || 'bottom')) ||
                    (e.toNode === nodeId && (e.toSide || 'top') === (side || 'top'))
                );

                if (sameSideEdges.length > 1) {
                    const idx = sameSideEdges.findIndex(e => e.id === edgeId);
                    if (idx !== -1) {
                        const total = sameSideEdges.length;
                        const maxSpan = (side === 'top' || side === 'bottom') ? node.width * 0.6 : node.height * 0.6;
                        const spacing = Math.min(22, maxSpan / (total - 1 || 1));
                        const offset = (idx - (total - 1) / 2) * spacing;

                        if (side === 'top' || side === 'bottom') {
                            baseX += offset;
                        } else {
                            baseY += offset;
                        }
                    }
                }
            }

            return { x: baseX, y: baseY };
        }

        calculateBezierPath(p1, p2, side1, side2) {
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.hypot(dx, dy);
            const offset = Math.min(Math.max(dist * 0.45, 40), 160);

            const normals = {
                top: { x: 0, y: -1 },
                bottom: { x: 0, y: 1 },
                left: { x: -1, y: 0 },
                right: { x: 1, y: 0 }
            };

            const n1 = normals[side1] || { x: 0, y: 1 };
            let n2;

            if (side2 && normals[side2]) {
                n2 = normals[side2];
            } else {
                if (Math.abs(dx) > Math.abs(dy)) {
                    n2 = { x: dx > 0 ? -1 : 1, y: 0 };
                } else {
                    n2 = { x: 0, y: dy > 0 ? -1 : 1 };
                }
            }

            const cp1x = p1.x + n1.x * offset;
            const cp1y = p1.y + n1.y * offset;
            const cp2x = p2.x + n2.x * offset;
            const cp2y = p2.y + n2.y * offset;

            return `M ${p1.x.toFixed(1)},${p1.y.toFixed(1)} C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
        }

        renderEdges() {
            const self = this;
            this.svgEdgesGroup.innerHTML = '';

            this.edges.forEach((edge) => {
                const sourceNode = self.nodes.find(n => n.id === edge.fromNode);
                const targetNode = self.nodes.find(n => n.id === edge.toNode);
                if (!sourceNode || !targetNode) return;

                const p1 = self.getPortCoordinates(edge.fromNode, edge.fromSide, edge.id);
                const p2 = self.getPortCoordinates(edge.toNode, edge.toSide, edge.id);
                const d = self.calculateBezierPath(p1, p2, edge.fromSide, edge.toSide);

                // SVG Group wrapping the connection
                const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                group.setAttribute('id', 'obs-edge-' + edge.id);
                group.dataset.edgeId = edge.id;

                let arrowColor = 'default';
                let colorClass = '';
                if (sourceNode.color && sourceNode.color !== 'default') {
                    arrowColor = sourceNode.color;
                    colorClass = ' color-' + sourceNode.color;
                }

                let groupClass = 'obs-edge-group' + colorClass;
                if (self.selectedEdgeId === edge.id) {
                    groupClass += ' selected';
                }
                group.setAttribute('class', groupClass);

                // 1. Wide Hitbox for easy left-click and right-click anywhere along wire or arrow
                const hitbox = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                hitbox.setAttribute('d', d);
                hitbox.setAttribute('class', 'obs-edge-hitbox');

                // 2. Base Wire Path with Arrowhead
                const basePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                basePath.setAttribute('d', d);
                basePath.setAttribute('class', 'obs-edge-path obs-edge-base' + colorClass);
                basePath.setAttribute('marker-end', `url(#obs-arrow-${arrowColor})`);

                // 3. Unreal Blueprint Flow Overlay (flowing glowing energy beads / bolinhas)
                const flowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                flowPath.setAttribute('d', d);
                flowPath.setAttribute('class', 'obs-edge-flow' + colorClass);

                group.appendChild(hitbox);
                group.appendChild(basePath);
                group.appendChild(flowPath);

                // Left Click on edge: select and show options
                group.addEventListener('mousedown', (e) => {
                    if (self.connectingPort) return;
                    if (e.button === 0) {
                        e.stopPropagation();
                        self.selectEdge(edge.id, e.clientX, e.clientY);
                    }
                });

                // Right Click on edge/arrow: show mini pop-up right beside the cursor!
                group.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    self.selectEdge(edge.id, e.clientX, e.clientY);
                });

                self.svgEdgesGroup.appendChild(group);
            });
        }

        updateStatus() {
            const count = this.edges.length;
            const el = document.getElementById('obs-link-count');
            if (el) {
                el.textContent = `${count} link${count !== 1 ? 's' : ''} inverso${count !== 1 ? 's' : ''}`;
            }
        }

        uploadPastedImage(base64, originalName) {
            const self = this;
            const center = this.getViewportCenter();

            $.ajax({
                url: self.rootDoc + '/ajax/canvas.php?action=upload&id=' + self.kbId,
                type: 'POST',
                data: JSON.stringify({ base64: base64 }),
                contentType: 'application/json',
                success: function (res) {
                    if (res.success) {
                        self.addNode({
                            type: 'image',
                            title: originalName || res.filename || 'Pasted image',
                            imageUrl: res.url,
                            x: center.x - 140,
                            y: center.y - 100,
                            width: 280,
                            height: 200,
                            color: 'default'
                        });
                    } else {
                        // Fallback: direct data URL
                        self.addNode({
                            type: 'image',
                            title: 'Pasted image',
                            imageUrl: base64,
                            x: center.x - 140,
                            y: center.y - 100,
                            width: 280,
                            height: 200,
                            color: 'default'
                        });
                    }
                },
                error: function () {
                    // Fallback to inline base64
                    self.addNode({
                        type: 'image',
                        title: 'Pasted image',
                        imageUrl: base64,
                        x: center.x - 140,
                        y: center.y - 100,
                        width: 280,
                        height: 200,
                        color: 'default'
                    });
                }
            });
        }

        // Persistence (Load / Save)
        scheduleSave() {
            clearTimeout(this.saveTimeout);
            const self = this;
            this.saveTimeout = setTimeout(() => {
                self.saveData();
            }, 600);
        }

        saveData() {
            const payload = {
                panX: this.panX,
                panY: this.panY,
                zoom: this.zoom,
                nodes: this.nodes,
                edges: this.edges
            };

            // 1. Sync to local storage for zero latency
            try {
                localStorage.setItem('glpi_canvas_kb_' + this.kbId, JSON.stringify(payload));
            } catch (e) { }

            // 2. Persist to GLPI backend
            $.ajax({
                url: this.rootDoc + '/ajax/canvas.php?action=save&id=' + this.kbId,
                type: 'POST',
                data: JSON.stringify(payload),
                contentType: 'application/json',
                success: function () {
                    // Saved successfully
                }
            });
        }

        loadData() {
            const self = this;

            // Check server data
            $.ajax({
                url: self.rootDoc + '/ajax/canvas.php?action=load&id=' + self.kbId,
                type: 'GET',
                dataType: 'json',
                success: function (res) {
                    if (res && res.success && res.data) {
                        self.hydrateData(res.data);
                    } else {
                        // Check local storage backup
                        const local = localStorage.getItem('glpi_canvas_kb_' + self.kbId);
                        if (local) {
                            try {
                                self.hydrateData(JSON.parse(local));
                                return;
                            } catch (e) { }
                        }
                        // If no data, load starter canvas faithfully replicating Image 1!
                        self.loadStarterCanvas();
                    }
                },
                error: function () {
                    const local = localStorage.getItem('glpi_canvas_kb_' + self.kbId);
                    if (local) {
                        try {
                            self.hydrateData(JSON.parse(local));
                            return;
                        } catch (e) { }
                    }
                    self.loadStarterCanvas();
                }
            });
        }

        hydrateData(data) {
            this.nodes = [];
            this.edges = [];
            if (this.nodesContainer) {
                this.nodesContainer.innerHTML = '';
            }

            this.panX = (typeof data.panX === 'number' && isFinite(data.panX)) ? data.panX : 80;
            this.panY = (typeof data.panY === 'number' && isFinite(data.panY)) ? data.panY : 80;
            this.zoom = (typeof data.zoom === 'number' && isFinite(data.zoom) && data.zoom > 0) ? data.zoom : 1.0;

            if (Array.isArray(data.nodes) && data.nodes.length > 0) {
                data.nodes.forEach(n => {
                    this.nodes.push(n);
                    this.createNodeElement(n);
                });
            } else {
                this.loadStarterCanvas();
                return;
            }

            if (Array.isArray(data.edges)) {
                this.edges = data.edges;
                this.renderEdges();
            }

            this.applyTransform();
            this.updateStatus();
        }

        /**
         * Loads initial starter canvas exactly modeled after user's Image 1!
         */
        loadStarterCanvas() {
            const initialNodes = [
                // Center column (Green action cards)
                { id: 'n_resp', type: 'text', title: 'Responsabilidade', content: 'Tarefas Hoje', x: 420, y: 180, width: 170, height: 60, color: 'green' },
                { id: 'n_test', type: 'text', title: 'Testar funções', content: 'Validar rotinas do sistema', x: 420, y: 270, width: 170, height: 60, color: 'green' },
                { id: 'n_redef', type: 'text', title: 'Redefinir o dashboard', content: 'Ajuste de gráficos e métricas', x: 420, y: 360, width: 170, height: 60, color: 'green' },
                { id: 'n_rever_rank', type: 'text', title: 'Rever Ranking', content: 'Rever Ranking dos clientes pois está pegando a mesma nota que de padeiro', x: 420, y: 460, width: 180, height: 90, color: 'default' },
                { id: 'n_rever_design', type: 'text', title: 'Rever Design nova tarefa', content: 'Ajuste na interface do formulário', x: 420, y: 590, width: 190, height: 60, color: 'green' },

                // Left column
                { id: 'n_admin_l', type: 'text', title: 'Admin', content: 'Pasted image 2026...\n📊 Dashboard\n📅 Cronograma\n⭐ Avaliação', x: 140, y: 220, width: 170, height: 160, color: 'default' },
                { id: 'n_padeiro_l', type: 'text', title: 'Padeiro', content: '🏠 Início\n📑 Nova Atividade\n🗓️ Minha Agenda', x: 140, y: 430, width: 170, height: 140, color: 'default' },

                // Right middle column
                { id: 'n_admin_r', type: 'text', title: 'Admin', content: 'Pasted image 2026...\n📊 Dashboard\n📅 Cronograma\n⭐ Avaliação', x: 670, y: 150, width: 170, height: 160, color: 'default' },
                { id: 'n_padeiro_r', type: 'text', title: 'Padeiro', content: '🏠 Início\n📑 Nova Atividade\n🗓️ Minha Agenda', x: 740, y: 430, width: 170, height: 140, color: 'green' },

                // Bug Cards
                { id: 'n_bug_bar', type: 'text', title: 'BUG NA BARRA DE PROGRESSÃO', content: 'Pasted image 20260505124131.png\nVerificar renderização do progresso', x: 1000, y: 180, width: 220, height: 90, color: 'green' },
                { id: 'n_nota_cli', type: 'text', title: 'Nota do cliente não computada', content: 'Pasted image 20260505125220.png\nErro no cálculo de notas', x: 1100, y: 360, width: 220, height: 90, color: 'green' },
                { id: 'n_filtrar', type: 'text', title: 'Opção Filtrar Produtos', content: 'Pasted image 20260505125017.png\nFiltro de busca e listagem', x: 1380, y: 180, width: 230, height: 90, color: 'default' }
            ];

            const initialEdges = [
                { id: 'e1', fromNode: 'n_resp', fromSide: 'left', toNode: 'n_admin_l', toSide: 'right' },
                { id: 'e2', fromNode: 'n_test', fromSide: 'left', toNode: 'n_admin_l', toSide: 'right' },
                { id: 'e3', fromNode: 'n_resp', fromSide: 'right', toNode: 'n_admin_r', toSide: 'left' },
                { id: 'e4', fromNode: 'n_admin_r', fromSide: 'bottom', toNode: 'n_padeiro_r', toSide: 'top' },
                { id: 'e5', fromNode: 'n_resp', fromSide: 'right', toNode: 'n_bug_bar', toSide: 'left' },
                { id: 'e6', fromNode: 'n_bug_bar', fromSide: 'bottom', toNode: 'n_nota_cli', toSide: 'top' }
            ];

            this.hydrateData({
                panX: 40,
                panY: 40,
                zoom: 0.85,
                nodes: initialNodes,
                edges: initialEdges
            });
        }
    }

    // Global initializer
    window.ObsidianCanvasApp = {
        init: function (config) {
            new ObsidianCanvas(config);
        }
    };

})(window, document, jQuery);
