<template>
  <main class="cad-shell">
    <aside class="toolbar">
      <div class="brand">Mini CAD</div>
      <button
        v-for="item in tools"
        :key="item.id"
        :class="{ active: tool === item.id }"
        :title="item.title"
        @click="setTool(item.id)"
      >
        <span class="tool-icon">{{ item.icon }}</span>
        <span>{{ item.label }}</span>
      </button>
    </aside>

    <section class="viewport-wrap">
      <div class="topbar">
        <span>{{ statusText }}</span>
        <span>Grid {{ gridSize }} mm</span>
        <span>{{ pointerText }}</span>
        <span v-if="selectedIds.length">Selected {{ selectedIds.length }}</span>
        <div class="history-actions">
          <button :disabled="!canUndo" title="撤销 Ctrl+Z" @click="undo">Undo</button>
          <button :disabled="!canRedo" title="重做 Ctrl+Y" @click="redo">Redo</button>
        </div>
      </div>

      <div ref="stageRef" class="stage">
        <canvas
          ref="glCanvasRef"
          class="cad-canvas"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointerleave="onPointerLeave"
          @dblclick="onDoubleClick"
        ></canvas>
        <canvas ref="labelCanvasRef" class="label-canvas"></canvas>
      </div>
    </section>

    <aside class="panel">
      <section>
        <h2>属性</h2>
        <p v-if="selectedIds.length > 1" class="empty">已选择 {{ selectedIds.length }} 个对象，可拖动或批量删除。</p>
        <template v-else-if="selectedEntity">
          <div class="field">
            <label>类型</label>
            <output>{{ entityName(selectedEntity) }}</output>
          </div>

          <div class="field">
            <label>图层</label>
            <select :value="selectedEntity.layerId" @change="setSelectedLayer($event.target.value)">
              <option v-for="layer in layers" :key="layer.id" :value="layer.id">
                {{ layer.name }}
              </option>
            </select>
          </div>

          <template v-if="selectedEntity.type === 'line'">
            <div class="field">
              <label>长度 mm</label>
              <input
                type="number"
                min="1"
                step="1"
                :value="lineLength(selectedEntity).toFixed(1)"
                @change="setLineLength($event.target.value)"
              />
            </div>
          </template>

          <template v-if="selectedEntity.type === 'circle'">
            <div class="field">
              <label>半径 mm</label>
              <input
                type="number"
                min="1"
                step="1"
                :value="selectedEntity.r.toFixed(1)"
                @change="setCircleRadius($event.target.value)"
              />
            </div>
          </template>

          <template v-if="selectedEntity.type === 'ellipse'">
            <div class="field">
              <label>横向半径 mm</label>
              <input
                type="number"
                min="1"
                step="1"
                :value="selectedEntity.rx.toFixed(1)"
                @change="setEllipseRadius('rx', $event.target.value)"
              />
            </div>
            <div class="field">
              <label>纵向半径 mm</label>
              <input
                type="number"
                min="1"
                step="1"
                :value="selectedEntity.ry.toFixed(1)"
                @change="setEllipseRadius('ry', $event.target.value)"
              />
            </div>
          </template>

          <template v-if="selectedEntity.type === 'rect'">
            <div class="field">
              <label>宽度 mm</label>
              <input
                type="number"
                min="1"
                step="1"
                :value="Math.abs(selectedEntity.w).toFixed(1)"
                @change="setRectSize('w', $event.target.value)"
              />
            </div>
            <div class="field">
              <label>高度 mm</label>
              <input
                type="number"
                min="1"
                step="1"
                :value="Math.abs(selectedEntity.h).toFixed(1)"
                @change="setRectSize('h', $event.target.value)"
              />
            </div>
          </template>

          <template v-if="selectedEntity.type === 'arc'">
            <div class="field">
              <label>弧长 mm</label>
              <output>{{ arcLength(selectedEntity).toFixed(1) }}</output>
            </div>
          </template>

          <template v-if="selectedEntity.type === 'triangle' || selectedEntity.type === 'polyline'">
            <div class="field">
              <label>总长度 mm</label>
              <output>{{ entityPathLength(selectedEntity).toFixed(1) }}</output>
            </div>
          </template>

          <button class="danger" @click="deleteSelected">删除</button>
        </template>
        <p v-else class="empty">选择一个对象后可以输入精确尺寸。</p>
        <button v-if="selectedIds.length > 1" class="danger" @click="deleteSelected">删除所选</button>
      </section>

      <section>
        <div class="section-heading">
          <h2>图层</h2>
          <button title="新增图层" @click="addLayer">+</button>
        </div>
        <div class="field">
          <label>当前图层</label>
          <select v-model.number="currentLayerId">
            <option v-for="layer in layers" :key="layer.id" :value="layer.id">
              {{ layer.name }}
            </option>
          </select>
        </div>
        <div class="layer-list">
          <div
            v-for="layer in layers"
            :key="layer.id"
            class="layer-row"
            :class="{ active: layer.id === currentLayerId }"
          >
            <input class="swatch" type="color" :value="layer.color" title="图层颜色" @change="setLayerColor(layer.id, $event.target.value)" />
            <input :value="layer.name" @change="renameLayer(layer.id, $event.target.value)" />
            <button :class="{ active: layer.visible }" title="显示/隐藏" @click="toggleLayerVisible(layer.id)">
              {{ layer.visible ? '显' : '隐' }}
            </button>
            <button :class="{ active: layer.locked }" title="锁定/解锁" @click="toggleLayerLocked(layer.id)">
              {{ layer.locked ? '锁' : '开' }}
            </button>
          </div>
        </div>
      </section>

      <section>
        <h2>对象</h2>
        <div class="entity-list">
          <button
            v-for="entity in visibleEntities"
            :key="entity.id"
            :class="{ selected: isSelected(entity.id) }"
            :disabled="isLayerLocked(entity.layerId)"
            @click="selectEntity(entity.id)"
          >
            {{ entityName(entity) }} #{{ entity.id }}
          </button>
        </div>
      </section>
    </aside>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue';

const stageRef = ref(null);
const glCanvasRef = ref(null);
const labelCanvasRef = ref(null);

const tools = [
  { id: 'select', label: '选择', icon: '↖', title: '选择和移动对象' },
  { id: 'lasso', label: '套索', icon: '⌁', title: '拖出自由套索，多选对象' },
  { id: 'line', label: '直线', icon: '/', title: '点击两点画线' },
  { id: 'circle', label: '圆', icon: '○', title: '点击圆心，再点击半径点' },
  { id: 'ellipse', label: '椭圆', icon: '⬭', title: '点击中心，再点击半径角点画椭圆' },
  { id: 'rect', label: '矩形', icon: '□', title: '点击两个角点画矩形' },
  { id: 'arc', label: '圆弧', icon: '⌒', title: '点击起点、弧上一点、终点画圆弧' },
  { id: 'triangle', label: '三角形', icon: '△', title: '点击三个顶点画三角形' },
  { id: 'polyline', label: '多段线', icon: '⌁', title: '连续点击加点，Enter 或双击完成' },
];
const layerColors = ['#c7d7ea', '#74c69d', '#6bb7ff', '#f6c85f', '#f28b82', '#c084fc', '#7dd3fc'];

const tool = ref('select');
const gridSize = 25;
const snapEnabled = true;
const entities = reactive([]);
const layers = reactive([
  { id: 1, name: '默认', color: '#c7d7ea', visible: true, locked: false },
  { id: 2, name: '尺寸', color: '#74c69d', visible: true, locked: false },
  { id: 3, name: '辅助线', color: '#6bb7ff', visible: true, locked: false },
]);
const currentLayerId = ref(1);
const selectedIds = ref([]);
const pointer = reactive({ x: 0, y: 0 });
const draft = ref(null);
const drag = ref(null);
const handleDrag = ref(null);
const lasso = ref(null);
const undoStack = ref([]);
const redoStack = ref([]);

let gl = null;
let program = null;
let positionLocation = null;
let resolutionLocation = null;
let colorLocation = null;
let buffer = null;
let nextId = 1;
let nextLayerId = 4;

const selectedId = computed(() => selectedIds.value[0] ?? null);
const selectedEntity = computed(() => entities.find((item) => item.id === selectedId.value) || null);
const selectedEntities = computed(() => entities.filter((item) => selectedIds.value.includes(item.id)));
const visibleEntities = computed(() => entities.filter((entity) => isLayerVisible(entity.layerId)));
const canUndo = computed(() => undoStack.value.length > 0);
const canRedo = computed(() => redoStack.value.length > 0);
const pointerText = computed(() => `X ${pointer.x.toFixed(0)} / Y ${pointer.y.toFixed(0)}`);
const statusText = computed(() => {
  if (tool.value === 'select') return '选择对象，可拖动，Delete 删除';
  if (tool.value === 'lasso') return lasso.value ? '松开鼠标完成套索选择' : '按住拖动套索，多选对象';
  if (draft.value?.tool === 'arc') return `点击圆弧第 ${draft.value.points.length + 1} 点`;
  if (draft.value?.tool === 'triangle') return `点击三角形第 ${draft.value.points.length + 1} 个顶点`;
  if (draft.value?.tool === 'polyline') return '继续点击加点，Enter 或双击完成';
  if (draft.value) return '选择第二点完成绘制';
  if (tool.value === 'line') return '点击起点绘制直线';
  if (tool.value === 'circle') return '点击圆心绘制圆';
  if (tool.value === 'ellipse') return '点击中心绘制椭圆';
  if (tool.value === 'rect') return '点击第一个角点绘制矩形';
  if (tool.value === 'arc') return '点击圆弧起点';
  if (tool.value === 'triangle') return '点击三角形第一个顶点';
  return '点击多段线起点，Enter 或双击完成';
});

function setTool(nextTool) {
  tool.value = nextTool;
  draft.value = null;
  drag.value = null;
  handleDrag.value = null;
  lasso.value = null;
  render();
}

function selectEntity(id) {
  const entity = entities.find((item) => item.id === id);
  if (!entity || !isLayerVisible(entity.layerId) || isLayerLocked(entity.layerId)) return;
  selectedIds.value = [id];
  tool.value = 'select';
  render();
}

function isSelected(id) {
  return selectedIds.value.includes(id);
}

function entityName(entity) {
  if (entity.type === 'line') return '直线';
  if (entity.type === 'circle') return '圆';
  if (entity.type === 'ellipse') return '椭圆';
  if (entity.type === 'arc') return '圆弧';
  if (entity.type === 'triangle') return '三角形';
  if (entity.type === 'polyline') return '多段线';
  return '矩形';
}

function lineLength(line) {
  return Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
}

function arcLength(entity) {
  const geometry = arcGeometry(entity.points[0], entity.points[1], entity.points[2]);
  return geometry ? Math.abs(geometry.sweep) * geometry.r : pathLength(entity.points);
}

function entityPathLength(entity) {
  if (entity.type === 'triangle') return pathLength(closedPath(entity.points));
  return pathLength(entity.points);
}

function setLineLength(rawValue) {
  const entity = selectedEntity.value;
  const value = Number(rawValue);
  if (!entity || entity.type !== 'line' || !Number.isFinite(value) || value <= 0) return;
  recordHistory();
  const length = lineLength(entity) || 1;
  const dx = (entity.x2 - entity.x1) / length;
  const dy = (entity.y2 - entity.y1) / length;
  entity.x2 = entity.x1 + dx * value;
  entity.y2 = entity.y1 + dy * value;
  render();
}

function setCircleRadius(rawValue) {
  const entity = selectedEntity.value;
  const value = Number(rawValue);
  if (!entity || entity.type !== 'circle' || !Number.isFinite(value) || value <= 0) return;
  recordHistory();
  entity.r = value;
  render();
}

function setEllipseRadius(axis, rawValue) {
  const entity = selectedEntity.value;
  const value = Number(rawValue);
  if (!entity || entity.type !== 'ellipse' || !Number.isFinite(value) || value <= 0) return;
  recordHistory();
  entity[axis] = value;
  render();
}

function setRectSize(axis, rawValue) {
  const entity = selectedEntity.value;
  const value = Number(rawValue);
  if (!entity || entity.type !== 'rect' || !Number.isFinite(value) || value <= 0) return;
  recordHistory();
  entity[axis] = Math.sign(entity[axis] || 1) * value;
  render();
}

function setSelectedLayer(rawValue) {
  const entity = selectedEntity.value;
  const layerId = Number(rawValue);
  if (!entity || !layers.some((layer) => layer.id === layerId)) return;
  recordHistory();
  entity.layerId = layerId;
  selectedIds.value = isLayerLocked(layerId) || !isLayerVisible(layerId) ? [] : selectedIds.value;
  render();
}

function addLayer() {
  recordHistory();
  const id = nextLayerId++;
  layers.push({
    id,
    name: `图层 ${id}`,
    color: layerColors[(id - 1) % layerColors.length],
    visible: true,
    locked: false,
  });
  currentLayerId.value = id;
  render();
}

function renameLayer(id, rawName) {
  const layer = layerById(id);
  const name = rawName.trim();
  if (!layer || !name || layer.name === name) return;
  recordHistory();
  layer.name = name;
}

function setLayerColor(id, color) {
  const layer = layerById(id);
  if (!layer || layer.color === color) return;
  recordHistory();
  layer.color = color;
  render();
}

function toggleLayerVisible(id) {
  const layer = layerById(id);
  if (!layer) return;
  recordHistory();
  layer.visible = !layer.visible;
  clearInvalidSelection();
  render();
}

function toggleLayerLocked(id) {
  const layer = layerById(id);
  if (!layer) return;
  recordHistory();
  layer.locked = !layer.locked;
  clearInvalidSelection();
  render();
}

function layerById(id) {
  return layers.find((layer) => layer.id === Number(id));
}

function entityLayer(entity) {
  return layerById(entity.layerId) || layers[0];
}

function isLayerVisible(id) {
  return entityLayer({ layerId: id }).visible;
}

function isLayerLocked(id) {
  return entityLayer({ layerId: id }).locked;
}

function clearInvalidSelection() {
  selectedIds.value = selectedIds.value.filter((id) => {
    const entity = entities.find((item) => item.id === id);
    return entity && isLayerVisible(entity.layerId) && !isLayerLocked(entity.layerId);
  });
}

function deleteSelected() {
  if (!selectedIds.value.length) return;
  recordHistory();
  const selected = new Set(selectedIds.value);
  for (let i = entities.length - 1; i >= 0; i -= 1) {
    if (selected.has(entities[i].id)) entities.splice(i, 1);
  }
  selectedIds.value = [];
  render();
}

function recordHistory() {
  undoStack.value.push({
    entities: cloneEntities(),
    layers: cloneLayers(),
    currentLayerId: currentLayerId.value,
    selectedIds: [...selectedIds.value],
    nextId,
    nextLayerId,
  });
  redoStack.value = [];
}

function undo() {
  if (!undoStack.value.length) return;
  redoStack.value.push({
    entities: cloneEntities(),
    layers: cloneLayers(),
    currentLayerId: currentLayerId.value,
    selectedIds: [...selectedIds.value],
    nextId,
    nextLayerId,
  });
  restoreSnapshot(undoStack.value.pop());
}

function redo() {
  if (!redoStack.value.length) return;
  undoStack.value.push({
    entities: cloneEntities(),
    layers: cloneLayers(),
    currentLayerId: currentLayerId.value,
    selectedIds: [...selectedIds.value],
    nextId,
    nextLayerId,
  });
  restoreSnapshot(redoStack.value.pop());
}

function restoreSnapshot(snapshot) {
  entities.splice(0, entities.length, ...snapshot.entities.map((entity) => cloneEntity(entity)));
  layers.splice(0, layers.length, ...snapshot.layers.map((layer) => ({ ...layer })));
  currentLayerId.value = snapshot.currentLayerId;
  selectedIds.value = snapshot.selectedIds.filter((id) => entities.some((entity) => entity.id === id));
  nextId = snapshot.nextId;
  nextLayerId = snapshot.nextLayerId;
  draft.value = null;
  drag.value = null;
  handleDrag.value = null;
  lasso.value = null;
  render();
}

function cloneEntities() {
  return entities.map((entity) => cloneEntity(entity));
}

function cloneLayers() {
  return layers.map((layer) => ({ ...layer }));
}

function initWebGL() {
  gl = glCanvasRef.value.getContext('webgl', { antialias: true });
  if (!gl) throw new Error('WebGL is not supported');

  const vertexShader = compileShader(gl.VERTEX_SHADER, `
    attribute vec2 a_position;
    uniform vec2 u_resolution;

    void main() {
      vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
      gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    }
  `);

  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform vec4 u_color;

    void main() {
      gl_FragColor = u_color;
    }
  `);

  program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }

  positionLocation = gl.getAttribLocation(program, 'a_position');
  resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
  colorLocation = gl.getUniformLocation(program, 'u_color');
  buffer = gl.createBuffer();
}

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

function resize() {
  const stage = stageRef.value;
  const glCanvas = glCanvasRef.value;
  const labelCanvas = labelCanvasRef.value;
  const rect = stage.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  for (const canvas of [glCanvas, labelCanvas]) {
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }

  render();
}

function screenPoint(event, options = {}) {
  const rect = glCanvasRef.value.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const shouldSnap = options.snap ?? snapEnabled;
  const point = shouldSnap ? snapPoint({ x, y }) : { x, y };
  pointer.x = point.x;
  pointer.y = point.y;
  return point;
}

function snapPoint(point) {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  };
}

function onPointerDown(event) {
  glCanvasRef.value.setPointerCapture(event.pointerId);
  const point = screenPoint(event, { snap: tool.value !== 'lasso' });

  if (tool.value === 'lasso') {
    selectedIds.value = [];
    lasso.value = { points: [point] };
    render();
    return;
  }

  if (tool.value === 'select') {
    const handleHit = pickHandle(point);
    if (handleHit) {
      if (!isSelected(handleHit.entity.id)) selectedIds.value = [handleHit.entity.id];
      handleDrag.value = {
        entityId: handleHit.entity.id,
        handle: handleHit.handle.key,
        original: cloneEntity(handleHit.entity),
        historyRecorded: false,
      };
      render();
      return;
    }

    const hit = pick(point);
    if (!hit) {
      selectedIds.value = [];
      render();
      return;
    }

    if (!isSelected(hit.id)) selectedIds.value = [hit.id];
    drag.value = {
      start: point,
      originals: selectedEntities.value.map((entity) => cloneEntity(entity)),
      historyRecorded: false,
    };
    render();
    return;
  }

  if (isLayerLocked(currentLayerId.value) || !isLayerVisible(currentLayerId.value)) return;

  if (!draft.value) {
    draft.value = createDraft(tool.value, point);
    render();
    return;
  }

  updateDraftPoint(draft.value, point);
  if (draftReadyToCommit(draft.value)) commitDraft();
  else render();
}

function onPointerMove(event) {
  const point = screenPoint(event, { snap: tool.value !== 'lasso' });

  if (handleDrag.value) {
    if (!handleDrag.value.historyRecorded) {
      recordHistory();
      handleDrag.value.historyRecorded = true;
    }
    const entity = entities.find((item) => item.id === handleDrag.value.entityId);
    if (entity) moveHandleFromOriginal(entity, handleDrag.value.original, handleDrag.value.handle, point);
    render();
    return;
  }

  if (lasso.value) {
    const points = lasso.value.points;
    const last = points[points.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) >= 3) points.push(point);
    render();
    return;
  }

  if (drag.value) {
    if (!drag.value.historyRecorded) {
      recordHistory();
      drag.value.historyRecorded = true;
    }
    const dx = point.x - drag.value.start.x;
    const dy = point.y - drag.value.start.y;
    for (const original of drag.value.originals) {
      const entity = entities.find((item) => item.id === original.id);
      if (entity) moveEntityFromOriginal(entity, original, dx, dy);
    }
    render();
    return;
  }

  if (draft.value) {
    draft.value.current = point;
    render();
    return;
  }

  renderLabelsOnly();
}

function onPointerUp(event) {
  if (glCanvasRef.value.hasPointerCapture(event.pointerId)) {
    glCanvasRef.value.releasePointerCapture(event.pointerId);
  }

  if (lasso.value) {
    finishLasso();
    return;
  }

  handleDrag.value = null;
  drag.value = null;
}

function onPointerLeave() {
  handleDrag.value = null;
  drag.value = null;
}

function finishLasso() {
  const points = lasso.value.points;
  if (points.length >= 3) {
    selectedIds.value = visibleEntities.value
      .filter((entity) => !isLayerLocked(entity.layerId))
      .filter((entity) => entityInsideLasso(entity, points))
      .map((entity) => entity.id);
  }
  lasso.value = null;
  tool.value = 'select';
  render();
}

function commitDraft() {
  const entity = entityFromDraft(draft.value);
  if (entity) {
    const drawingTool = draft.value.tool;
    entity.layerId = currentLayerId.value;
    recordHistory();
    entities.push(entity);
    selectedIds.value = [entity.id];
    tool.value = drawingTool;
  }
  draft.value = null;
  render();
}

function createDraft(nextTool, point) {
  if (nextTool === 'arc' || nextTool === 'triangle' || nextTool === 'polyline') {
    return { tool: nextTool, points: [point], current: point };
  }
  return { tool: nextTool, start: point, current: point };
}

function updateDraftPoint(value, point) {
  if (value.points) {
    value.points.push(point);
    value.current = point;
    return;
  }
  value.current = point;
}

function draftReadyToCommit(value) {
  if (value.tool === 'arc' || value.tool === 'triangle') return value.points?.length >= 3;
  if (value.tool === 'polyline') return false;
  return true;
}

function finishPolyline() {
  if (!draft.value || draft.value.tool !== 'polyline') return;
  if (draft.value.points.length >= 2) {
    draft.value.current = draft.value.points[draft.value.points.length - 1];
    commitDraft();
  }
  else {
    draft.value = null;
    render();
  }
}

function onDoubleClick() {
  finishPolyline();
}

function entityFromDraft(value, assignId = true) {
  const draftId = () => (assignId ? nextId++ : -1);
  if (value.tool === 'arc') {
    const points = draftPoints(value);
    if (points.length < 3 || !arcGeometry(points[0], points[1], points[2])) return null;
    return { id: draftId(), type: 'arc', points: points.slice(0, 3).map(clonePoint) };
  }
  if (value.tool === 'triangle') {
    const points = draftPoints(value);
    if (points.length < 3 || polygonArea(points.slice(0, 3)) === 0) return null;
    return { id: draftId(), type: 'triangle', points: points.slice(0, 3).map(clonePoint) };
  }
  if (value.tool === 'polyline') {
    const points = draftPoints(value);
    if (points.length < 2 || pathLength(points) <= 0) return null;
    return { id: draftId(), type: 'polyline', points: points.map(clonePoint) };
  }

  const { start, current } = value;
  if (value.tool === 'line' && Math.hypot(current.x - start.x, current.y - start.y) > 0) {
    return { id: draftId(), type: 'line', x1: start.x, y1: start.y, x2: current.x, y2: current.y };
  }
  if (value.tool === 'circle') {
    const r = Math.hypot(current.x - start.x, current.y - start.y);
    if (r <= 0) return null;
    return { id: draftId(), type: 'circle', cx: start.x, cy: start.y, r };
  }
  if (value.tool === 'ellipse') {
    const rx = Math.abs(current.x - start.x);
    const ry = Math.abs(current.y - start.y);
    if (rx <= 0 || ry <= 0) return null;
    return { id: draftId(), type: 'ellipse', cx: start.x, cy: start.y, rx, ry };
  }
  if (value.tool === 'rect' && Math.abs(current.x - start.x) > 0 && Math.abs(current.y - start.y) > 0) {
    return { id: draftId(), type: 'rect', x: start.x, y: start.y, w: current.x - start.x, h: current.y - start.y };
  }
  return null;
}

function draftPoints(value) {
  const points = value.points ? value.points.map(clonePoint) : [];
  if (value.current && points.length && !samePoint(points[points.length - 1], value.current)) {
    points.push(clonePoint(value.current));
  }
  return points;
}

function moveEntityFromOriginal(entity, original, dx, dy) {
  if (entity.type === 'line') {
    entity.x1 = original.x1 + dx;
    entity.y1 = original.y1 + dy;
    entity.x2 = original.x2 + dx;
    entity.y2 = original.y2 + dy;
  } else if (entity.type === 'circle') {
    entity.cx = original.cx + dx;
    entity.cy = original.cy + dy;
  } else if (entity.type === 'ellipse') {
    entity.cx = original.cx + dx;
    entity.cy = original.cy + dy;
  } else if (entity.points) {
    entity.points = original.points.map((item) => ({ x: item.x + dx, y: item.y + dy }));
  } else {
    entity.x = original.x + dx;
    entity.y = original.y + dy;
  }
}

function cloneEntity(entity) {
  const base = { id: entity.id, type: entity.type, layerId: entity.layerId ?? 1 };
  if (entity.type === 'line') {
    return { ...base, x1: entity.x1, y1: entity.y1, x2: entity.x2, y2: entity.y2 };
  }
  if (entity.type === 'circle') {
    return { ...base, cx: entity.cx, cy: entity.cy, r: entity.r };
  }
  if (entity.type === 'ellipse') {
    return { ...base, cx: entity.cx, cy: entity.cy, rx: entity.rx, ry: entity.ry };
  }
  if (entity.points) {
    return { ...base, points: entity.points.map(clonePoint) };
  }
  return { ...base, x: entity.x, y: entity.y, w: entity.w, h: entity.h };
}

function clonePoint(point) {
  return { x: point.x, y: point.y };
}

function samePoint(a, b) {
  return a.x === b.x && a.y === b.y;
}

function moveHandleFromOriginal(entity, original, handle, point) {
  if (entity.type === 'line') {
    if (handle === 'start') {
      entity.x1 = point.x;
      entity.y1 = point.y;
    } else {
      entity.x2 = point.x;
      entity.y2 = point.y;
    }
    return;
  }

  if (entity.type === 'circle') {
    if (handle === 'center') {
      entity.cx = point.x;
      entity.cy = point.y;
    } else {
      entity.r = Math.max(1, Math.hypot(point.x - original.cx, point.y - original.cy));
    }
    return;
  }

  if (entity.type === 'ellipse') {
    if (handle === 'center') {
      entity.cx = point.x;
      entity.cy = point.y;
    } else {
      if (handle.includes('e') || handle.includes('w')) entity.rx = Math.max(1, Math.abs(point.x - original.cx));
      if (handle.includes('n') || handle.includes('s')) entity.ry = Math.max(1, Math.abs(point.y - original.cy));
    }
    return;
  }

  if (entity.type === 'arc' || entity.type === 'triangle' || entity.type === 'polyline') {
    const index = Number(handle.slice(1));
    if (Number.isInteger(index) && entity.points[index]) {
      entity.points[index] = clonePoint(point);
    }
    return;
  }

  const bounds = entityBounds(original);
  let minX = bounds.minX;
  let minY = bounds.minY;
  let maxX = bounds.maxX;
  let maxY = bounds.maxY;

  if (handle.includes('w')) minX = point.x;
  if (handle.includes('e')) maxX = point.x;
  if (handle.includes('n')) minY = point.y;
  if (handle.includes('s')) maxY = point.y;

  if (maxX === minX) maxX += 1;
  if (maxY === minY) maxY += 1;

  entity.x = minX;
  entity.y = minY;
  entity.w = maxX - minX;
  entity.h = maxY - minY;
}

function pick(point) {
  for (let i = entities.length - 1; i >= 0; i -= 1) {
    const entity = entities[i];
    if (!isLayerVisible(entity.layerId) || isLayerLocked(entity.layerId)) continue;
    if (hitEntity(entity, point)) return entity;
  }
  return null;
}

function pickHandle(point) {
  const tolerance = 10;
  for (let i = selectedEntities.value.length - 1; i >= 0; i -= 1) {
    const entity = selectedEntities.value[i];
    const handles = selectionHandles(entity);
    for (let j = handles.length - 1; j >= 0; j -= 1) {
      const handle = handles[j];
      if (Math.hypot(point.x - handle.x, point.y - handle.y) <= tolerance) {
        return { entity, handle };
      }
    }
  }
  return null;
}

function hitEntity(entity, point) {
  const tolerance = 9;
  if (entity.type === 'line') {
    return distanceToSegment(point, { x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 }) <= tolerance;
  }
  if (entity.type === 'circle') {
    return Math.hypot(point.x - entity.cx, point.y - entity.cy) <= entity.r + tolerance;
  }
  if (entity.type === 'ellipse') {
    const normalized =
      ((point.x - entity.cx) * (point.x - entity.cx)) / (entity.rx * entity.rx) +
      ((point.y - entity.cy) * (point.y - entity.cy)) / (entity.ry * entity.ry);
    return normalized <= 1 || distanceToPath(point, ellipseVertices(entity.cx, entity.cy, entity.rx, entity.ry)) <= tolerance;
  }
  if (entity.type === 'arc') {
    return distanceToPath(point, arcVertices(entity.points[0], entity.points[1], entity.points[2])) <= tolerance;
  }
  if (entity.type === 'triangle') {
    return distanceToPath(point, closedPath(entity.points)) <= tolerance || pointInPolygon(point, entity.points);
  }
  if (entity.type === 'polyline') {
    return distanceToPath(point, entity.points) <= tolerance;
  }
  const minX = Math.min(entity.x, entity.x + entity.w);
  const maxX = Math.max(entity.x, entity.x + entity.w);
  const minY = Math.min(entity.y, entity.y + entity.h);
  const maxY = Math.max(entity.y, entity.y + entity.h);
  return (
    point.x >= minX - tolerance &&
    point.x <= maxX + tolerance &&
    point.y >= minY - tolerance &&
    point.y <= maxY + tolerance
  );
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function distanceToPath(point, points) {
  if (points.length < 2) return Infinity;
  let min = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    min = Math.min(min, distanceToSegment(point, points[i - 1], points[i]));
  }
  return min;
}

function entityInsideLasso(entity, polygon) {
  return entityTestPoints(entity).some((point) => pointInPolygon(point, polygon));
}

function entityTestPoints(entity) {
  if (entity.type === 'line') {
    return [
      { x: entity.x1, y: entity.y1 },
      { x: entity.x2, y: entity.y2 },
      { x: (entity.x1 + entity.x2) / 2, y: (entity.y1 + entity.y2) / 2 },
    ];
  }
  if (entity.type === 'circle') {
    return [
      { x: entity.cx, y: entity.cy },
      { x: entity.cx + entity.r, y: entity.cy },
      { x: entity.cx - entity.r, y: entity.cy },
      { x: entity.cx, y: entity.cy + entity.r },
      { x: entity.cx, y: entity.cy - entity.r },
    ];
  }
  if (entity.type === 'ellipse') {
    return [
      { x: entity.cx, y: entity.cy },
      { x: entity.cx + entity.rx, y: entity.cy },
      { x: entity.cx - entity.rx, y: entity.cy },
      { x: entity.cx, y: entity.cy + entity.ry },
      { x: entity.cx, y: entity.cy - entity.ry },
    ];
  }
  if (entity.type === 'arc') {
    return [
      ...entity.points,
      ...arcVertices(entity.points[0], entity.points[1], entity.points[2]).filter((_, index, points) => index % Math.max(1, Math.floor(points.length / 4)) === 0),
    ];
  }
  if (entity.type === 'triangle' || entity.type === 'polyline') {
    return entity.points.map(clonePoint);
  }
  const x2 = entity.x + entity.w;
  const y2 = entity.y + entity.h;
  return [
    { x: entity.x, y: entity.y },
    { x: x2, y: entity.y },
    { x: x2, y: y2 },
    { x: entity.x, y: y2 },
    { x: (entity.x + x2) / 2, y: (entity.y + y2) / 2 },
  ];
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersects =
      pi.y > point.y !== pj.y > point.y &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y || 1) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function render() {
  if (!gl) return;
  const canvas = glCanvasRef.value;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.075, 0.082, 0.094, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);
  gl.uniform2f(resolutionLocation, width, height);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  drawGrid(width, height);

  for (const entity of entities) {
    if (!isLayerVisible(entity.layerId)) continue;
    drawEntity(entity, isSelected(entity.id));
    if (isSelected(entity.id)) drawSelection(entity);
  }

  if (draft.value) {
    const preview = entityFromDraft({ ...draft.value, current: draft.value.current }, false);
    if (preview) drawEntity(preview, true, true);
  }

  if (lasso.value) drawLasso(lasso.value.points);

  renderLabelsOnly();
}

function drawGrid(width, height) {
  const fine = [];
  for (let x = 0; x <= width; x += gridSize) fine.push(x, 0, x, height);
  for (let y = 0; y <= height; y += gridSize) fine.push(0, y, width, y);
  drawLines(fine, [0.18, 0.2, 0.23, 1]);

  const major = [];
  const majorStep = gridSize * 4;
  for (let x = 0; x <= width; x += majorStep) major.push(x, 0, x, height);
  for (let y = 0; y <= height; y += majorStep) major.push(0, y, width, y);
  drawLines(major, [0.27, 0.3, 0.34, 1]);
}

function drawEntity(entity, selected = false, preview = false) {
  const layer = entityLayer(entity);
  const color = selected ? [1, 0.9, 0.18, 1] : preview ? [0.55, 0.78, 1, 1] : hexToColor(layer.color);
  if (entity.type === 'line') {
    drawLines([entity.x1, entity.y1, entity.x2, entity.y2], color);
  } else if (entity.type === 'circle') {
    drawLines(circleVertices(entity.cx, entity.cy, entity.r), color, gl.LINE_LOOP);
  } else if (entity.type === 'ellipse') {
    drawLines(ellipseVertices(entity.cx, entity.cy, entity.rx, entity.ry), color, gl.LINE_LOOP);
  } else if (entity.type === 'arc') {
    drawPath(arcVertices(entity.points[0], entity.points[1], entity.points[2]), color);
  } else if (entity.type === 'triangle') {
    drawPath(closedPath(entity.points), color);
  } else if (entity.type === 'polyline') {
    drawPath(entity.points, color);
  } else {
    const x2 = entity.x + entity.w;
    const y2 = entity.y + entity.h;
    drawLines([entity.x, entity.y, x2, entity.y, x2, entity.y, x2, y2, x2, y2, entity.x, y2, entity.x, y2, entity.x, entity.y], color);
  }
}

function hexToColor(hex) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  return [r, g, b, 1];
}

function drawSelection(entity) {
  const box = entityBounds(entity);
  const pad = 8;
  const minX = box.minX - pad;
  const minY = box.minY - pad;
  const maxX = box.maxX + pad;
  const maxY = box.maxY + pad;

  drawLines([
    minX, minY, maxX, minY,
    maxX, minY, maxX, maxY,
    maxX, maxY, minX, maxY,
    minX, maxY, minX, minY,
  ], [1, 0.68, 0.12, 1]);

  for (const handle of selectionHandles(entity)) {
    drawHandle(handle.x, handle.y);
  }
}

function drawLasso(points) {
  if (points.length < 2) return;
  const vertices = [];
  for (let i = 1; i < points.length; i += 1) {
    vertices.push(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
  }
  const first = points[0];
  const last = points[points.length - 1];
  vertices.push(last.x, last.y, first.x, first.y);
  drawLines(vertices, [0.36, 0.78, 1, 1]);
}

function entityBounds(entity) {
  if (entity.type === 'line') {
    return {
      minX: Math.min(entity.x1, entity.x2),
      minY: Math.min(entity.y1, entity.y2),
      maxX: Math.max(entity.x1, entity.x2),
      maxY: Math.max(entity.y1, entity.y2),
    };
  }
  if (entity.type === 'circle') {
    return {
      minX: entity.cx - entity.r,
      minY: entity.cy - entity.r,
      maxX: entity.cx + entity.r,
      maxY: entity.cy + entity.r,
    };
  }
  if (entity.type === 'ellipse') {
    return {
      minX: entity.cx - entity.rx,
      minY: entity.cy - entity.ry,
      maxX: entity.cx + entity.rx,
      maxY: entity.cy + entity.ry,
    };
  }
  if (entity.type === 'arc') {
    return pointsBounds(arcVertices(entity.points[0], entity.points[1], entity.points[2]));
  }
  if (entity.type === 'triangle' || entity.type === 'polyline') {
    return pointsBounds(entity.points);
  }
  return {
    minX: Math.min(entity.x, entity.x + entity.w),
    minY: Math.min(entity.y, entity.y + entity.h),
    maxX: Math.max(entity.x, entity.x + entity.w),
    maxY: Math.max(entity.y, entity.y + entity.h),
  };
}

function selectionHandles(entity) {
  if (entity.type === 'line') {
    return [
      { key: 'start', x: entity.x1, y: entity.y1 },
      { key: 'end', x: entity.x2, y: entity.y2 },
    ];
  }
  if (entity.type === 'circle') {
    return [
      { key: 'center', x: entity.cx, y: entity.cy },
      { key: 'radius-e', x: entity.cx + entity.r, y: entity.cy },
      { key: 'radius-n', x: entity.cx, y: entity.cy - entity.r },
      { key: 'radius-w', x: entity.cx - entity.r, y: entity.cy },
      { key: 'radius-s', x: entity.cx, y: entity.cy + entity.r },
    ];
  }
  if (entity.type === 'ellipse') {
    return [
      { key: 'center', x: entity.cx, y: entity.cy },
      { key: 'radius-e', x: entity.cx + entity.rx, y: entity.cy },
      { key: 'radius-n', x: entity.cx, y: entity.cy - entity.ry },
      { key: 'radius-w', x: entity.cx - entity.rx, y: entity.cy },
      { key: 'radius-s', x: entity.cx, y: entity.cy + entity.ry },
      { key: 'radius-ne', x: entity.cx + entity.rx, y: entity.cy - entity.ry },
      { key: 'radius-se', x: entity.cx + entity.rx, y: entity.cy + entity.ry },
      { key: 'radius-sw', x: entity.cx - entity.rx, y: entity.cy + entity.ry },
      { key: 'radius-nw', x: entity.cx - entity.rx, y: entity.cy - entity.ry },
    ];
  }
  if (entity.type === 'arc' || entity.type === 'triangle' || entity.type === 'polyline') {
    return entity.points.map((point, index) => ({ key: `p${index}`, x: point.x, y: point.y }));
  }
  const box = entityBounds(entity);
  return [
    { key: 'nw', x: box.minX, y: box.minY },
    { key: 'ne', x: box.maxX, y: box.minY },
    { key: 'se', x: box.maxX, y: box.maxY },
    { key: 'sw', x: box.minX, y: box.maxY },
  ];
}

function drawHandle(x, y) {
  const size = 5;
  drawTriangles([
    x - size, y - size,
    x + size, y - size,
    x + size, y + size,
    x - size, y - size,
    x + size, y + size,
    x - size, y + size,
  ], [1, 0.92, 0.32, 1]);
  drawLines([
    x - size, y - size, x + size, y - size,
    x + size, y - size, x + size, y + size,
    x + size, y + size, x - size, y + size,
    x - size, y + size, x - size, y - size,
  ], [0.12, 0.09, 0.02, 1]);
}

function circleVertices(cx, cy, r) {
  const verts = [];
  const segments = 96;
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    verts.push(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
  }
  return verts;
}

function ellipseVertices(cx, cy, rx, ry) {
  const verts = [];
  const segments = 96;
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    verts.push(cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry);
  }
  return verts;
}

function arcVertices(start, through, end) {
  const geometry = arcGeometry(start, through, end);
  if (!geometry) return [start, end].map(clonePoint);
  const verts = [];
  const steps = Math.max(16, Math.ceil(Math.abs(geometry.sweep) / (Math.PI / 36)));
  for (let i = 0; i <= steps; i += 1) {
    const angle = geometry.startAngle + (geometry.sweep * i) / steps;
    verts.push({
      x: geometry.cx + Math.cos(angle) * geometry.r,
      y: geometry.cy + Math.sin(angle) * geometry.r,
    });
  }
  return verts;
}

function arcGeometry(start, through, end) {
  const ax = start.x;
  const ay = start.y;
  const bx = through.x;
  const by = through.y;
  const cx = end.x;
  const cy = end.y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 0.001) return null;

  const ux =
    ((ax * ax + ay * ay) * (by - cy) +
      (bx * bx + by * by) * (cy - ay) +
      (cx * cx + cy * cy) * (ay - by)) /
    d;
  const uy =
    ((ax * ax + ay * ay) * (cx - bx) +
      (bx * bx + by * by) * (ax - cx) +
      (cx * cx + cy * cy) * (bx - ax)) /
    d;
  const r = Math.hypot(ax - ux, ay - uy);
  const startAngle = Math.atan2(ay - uy, ax - ux);
  const throughAngle = Math.atan2(by - uy, bx - ux);
  const endAngle = Math.atan2(cy - uy, cx - ux);
  const ccwSweep = normalizeAngle(endAngle - startAngle);
  const throughSweep = normalizeAngle(throughAngle - startAngle);
  const sweep = throughSweep <= ccwSweep ? ccwSweep : ccwSweep - Math.PI * 2;
  return { cx: ux, cy: uy, r, startAngle, sweep };
}

function normalizeAngle(angle) {
  const full = Math.PI * 2;
  return ((angle % full) + full) % full;
}

function closedPath(points) {
  if (!points.length) return [];
  return [...points.map(clonePoint), clonePoint(points[0])];
}

function pointsBounds(points) {
  if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function polygonArea(points) {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    area += points[i].x * next.y - next.x * points[i].y;
  }
  return Math.abs(area) / 2;
}

function pathLength(points) {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return length;
}

function drawPath(points, color) {
  if (points.length < 2) return;
  const vertices = [];
  for (let i = 1; i < points.length; i += 1) {
    vertices.push(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
  }
  drawLines(vertices, color);
}

function drawLines(vertices, color, mode = gl.LINES) {
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
  gl.uniform4fv(colorLocation, color);
  gl.drawArrays(mode, 0, vertices.length / 2);
}

function drawTriangles(vertices, color) {
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
  gl.uniform4fv(colorLocation, color);
  gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 2);
}

function renderLabelsOnly() {
  const canvas = labelCanvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

  ctx.font = '12px Inter, sans-serif';
  ctx.lineWidth = 1;
  ctx.textBaseline = 'middle';

  for (const entity of entities) {
    if (!isLayerVisible(entity.layerId)) continue;
    drawDimension(ctx, entity);
  }
}

function drawDimension(ctx, entity) {
  ctx.strokeStyle = '#74c69d';
  ctx.fillStyle = '#b7f4cf';

  if (entity.type === 'line') {
    const mx = (entity.x1 + entity.x2) / 2;
    const my = (entity.y1 + entity.y2) / 2;
    drawLabel(ctx, `${lineLength(entity).toFixed(1)} mm`, mx + 8, my - 12);
    return;
  }

  if (entity.type === 'circle') {
    ctx.beginPath();
    ctx.moveTo(entity.cx, entity.cy);
    ctx.lineTo(entity.cx + entity.r, entity.cy);
    ctx.stroke();
    drawLabel(ctx, `R ${entity.r.toFixed(1)} mm`, entity.cx + entity.r / 2 + 8, entity.cy - 12);
    return;
  }

  if (entity.type === 'ellipse') {
    ctx.beginPath();
    ctx.moveTo(entity.cx - entity.rx, entity.cy);
    ctx.lineTo(entity.cx + entity.rx, entity.cy);
    ctx.moveTo(entity.cx, entity.cy - entity.ry);
    ctx.lineTo(entity.cx, entity.cy + entity.ry);
    ctx.stroke();
    drawLabel(ctx, `Rx ${entity.rx.toFixed(1)} / Ry ${entity.ry.toFixed(1)} mm`, entity.cx + 8, entity.cy - entity.ry - 14);
    return;
  }

  if (entity.type === 'arc') {
    const points = arcVertices(entity.points[0], entity.points[1], entity.points[2]);
    const mid = points[Math.floor(points.length / 2)] || entity.points[1];
    drawLabel(ctx, `${arcLength(entity).toFixed(1)} mm`, mid.x + 8, mid.y - 12);
    return;
  }

  if (entity.type === 'triangle' || entity.type === 'polyline') {
    const box = entityBounds(entity);
    drawLabel(ctx, `${entityPathLength(entity).toFixed(1)} mm`, box.minX + 8, box.minY - 14);
    return;
  }

  const x2 = entity.x + entity.w;
  const y2 = entity.y + entity.h;
  drawLabel(ctx, `${Math.abs(entity.w).toFixed(1)} mm`, (entity.x + x2) / 2 - 24, Math.min(entity.y, y2) - 14);
  drawLabel(ctx, `${Math.abs(entity.h).toFixed(1)} mm`, Math.max(entity.x, x2) + 10, (entity.y + y2) / 2);
}

function drawLabel(ctx, text, x, y) {
  const metrics = ctx.measureText(text);
  const width = metrics.width + 10;
  ctx.fillStyle = 'rgba(12, 18, 23, 0.86)';
  ctx.fillRect(x - 5, y - 10, width, 20);
  ctx.fillStyle = '#b7f4cf';
  ctx.fillText(text, x, y);
}

function onKeyDown(event) {
  if (event.target instanceof HTMLInputElement) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    redo();
    return;
  }
  if (event.key === 'Enter') {
    finishPolyline();
    return;
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    deleteSelected();
  }
  if (event.key === 'Escape') {
    draft.value = null;
    drag.value = null;
    handleDrag.value = null;
    lasso.value = null;
    tool.value = 'select';
    render();
  }
}

onMounted(async () => {
  await nextTick();
  initWebGL();
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', onKeyDown);

  entities.push(
    { id: nextId++, type: 'line', layerId: 1, x1: 125, y1: 125, x2: 300, y2: 125 },
    { id: nextId++, type: 'circle', layerId: 1, cx: 450, cy: 220, r: 75 },
    { id: nextId++, type: 'rect', layerId: 1, x: 150, y: 300, w: 225, h: 125 },
  );
  render();
});

onUnmounted(() => {
  window.removeEventListener('resize', resize);
  window.removeEventListener('keydown', onKeyDown);
});
</script>

<style scoped>
.cad-shell {
  display: grid;
  grid-template-columns: 116px minmax(0, 1fr) 260px;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.toolbar,
.panel {
  background: #20242b;
  border-color: #343b46;
  border-style: solid;
}

.toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-width: 0 1px 0 0;
}

.brand {
  height: 32px;
  font-size: 14px;
  font-weight: 700;
  color: #f0f4f8;
}

.toolbar button,
.entity-list button,
.danger {
  border: 1px solid #3a4350;
  background: #272d36;
  color: #d7dde6;
  border-radius: 6px;
  cursor: pointer;
}

.toolbar button {
  position: relative;
  display: grid;
  grid-template-columns: 24px 1fr;
  align-items: center;
  min-height: 40px;
  padding: 0 8px;
  text-align: left;
}

.toolbar button.active {
  border-color: #ffe66d;
  background: #f4d84f;
  color: #11161c;
  box-shadow:
    0 0 0 2px rgba(244, 216, 79, 0.25),
    0 10px 22px rgba(0, 0, 0, 0.28);
  font-weight: 700;
}

.toolbar button.active::before {
  content: '';
  position: absolute;
  left: -1px;
  top: 6px;
  bottom: 6px;
  width: 4px;
  border-radius: 0 4px 4px 0;
  background: #101820;
}

.entity-list button.selected {
  border-color: #e7c84c;
  background: #443f25;
  color: #fff2a8;
}

.tool-icon {
  font-size: 18px;
  line-height: 1;
}

.viewport-wrap {
  display: grid;
  grid-template-rows: 36px minmax(0, 1fr);
  min-width: 0;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 14px;
  border-bottom: 1px solid #343b46;
  background: #1c2026;
  color: #b9c3cf;
  font-size: 13px;
}

.history-actions {
  display: flex;
  gap: 6px;
  margin-left: auto;
}

.history-actions button {
  min-height: 26px;
  border: 1px solid #3a4350;
  border-radius: 6px;
  background: #272d36;
  color: #d7dde6;
  cursor: pointer;
}

.history-actions button:disabled {
  color: #687383;
  cursor: default;
  opacity: 0.65;
}

.stage {
  position: relative;
  min-width: 0;
  min-height: 0;
}

.cad-canvas,
.label-canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}

.cad-canvas {
  cursor: crosshair;
}

.label-canvas {
  pointer-events: none;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 14px;
  border-width: 0 0 0 1px;
  overflow: auto;
}

h2 {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 700;
  color: #f2f5f8;
}

.field {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
}

label {
  font-size: 12px;
  color: #aeb8c5;
}

input,
output,
select {
  width: 100%;
  min-height: 34px;
  border: 1px solid #3a4350;
  border-radius: 6px;
  background: #161a20;
  color: #f3f7fb;
  padding: 6px 8px;
}

select {
  cursor: pointer;
}

.danger {
  width: 100%;
  min-height: 36px;
  margin-top: 4px;
  border-color: #794046;
  background: #3b2228;
  color: #ffd4d9;
}

.empty {
  margin: 0 0 12px;
  color: #99a6b5;
  font-size: 13px;
  line-height: 1.6;
}

.entity-list {
  display: grid;
  gap: 8px;
}

.entity-list button {
  min-height: 34px;
  text-align: left;
  padding: 0 10px;
}

.entity-list button:disabled {
  cursor: default;
  opacity: 0.55;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-heading h2 {
  margin: 0;
}

.section-heading button {
  width: 28px;
  height: 28px;
  border: 1px solid #3a4350;
  border-radius: 6px;
  background: #272d36;
  color: #d7dde6;
  cursor: pointer;
}

.layer-list {
  display: grid;
  gap: 8px;
}

.layer-row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 32px 32px;
  align-items: center;
  gap: 6px;
}

.layer-row.active input {
  border-color: #e7c84c;
}

.layer-row input {
  min-height: 30px;
}

.layer-row button,
.layer-row .swatch {
  min-height: 30px;
  border: 1px solid #3a4350;
  border-radius: 6px;
  background: #272d36;
  color: #d7dde6;
  cursor: pointer;
}

.layer-row button.active {
  border-color: #e7c84c;
  color: #fff2a8;
}

.layer-row .swatch {
  width: 24px;
  height: 24px;
  min-height: 24px;
  padding: 0;
}

@media (max-width: 860px) {
  .cad-shell {
    grid-template-columns: 88px minmax(0, 1fr);
  }

  .panel {
    display: none;
  }

  .toolbar button {
    grid-template-columns: 1fr;
    justify-items: center;
    padding: 0;
  }

  .toolbar button span:last-child {
    font-size: 12px;
  }
}
</style>
