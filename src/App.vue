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
        <span v-if="selectionText" class="selection-name">{{ selectionText }}</span>
        <span v-if="activeConstraintTool">约束 {{ constraintName(activeConstraintTool) }}</span>
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
          @contextmenu="onContextMenu"
        ></canvas>
        <canvas ref="labelCanvasRef" class="label-canvas"></canvas>
      </div>
    </section>

    <aside class="panel">
      <div class="panel-switch" role="tablist" aria-label="右侧面板">
        <button
          :class="{ active: panelMode === 'properties' }"
          role="tab"
          :aria-selected="panelMode === 'properties'"
          @click="panelMode = 'properties'"
        >
          属性
        </button>
        <button
          :class="{ active: panelMode === 'constraints' }"
          role="tab"
          :aria-selected="panelMode === 'constraints'"
          @click="panelMode = 'constraints'"
        >
          约束
          <span>{{ constraints.length }}</span>
        </button>
      </div>

      <div v-if="panelMode === 'properties'" class="panel-page">
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
              <select :value="selectedEntity.layerId" @change="setSelectedLayer($event)">
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
                  @change="setLineLength($event)"
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
                  @change="setCircleRadius($event)"
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
                  @change="setEllipseRadius('rx', $event)"
                />
              </div>
              <div class="field">
                <label>纵向半径 mm</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  :value="selectedEntity.ry.toFixed(1)"
                  @change="setEllipseRadius('ry', $event)"
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
                  @change="setRectSize('w', $event)"
                />
              </div>
              <div class="field">
                <label>高度 mm</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  :value="Math.abs(selectedEntity.h).toFixed(1)"
                  @change="setRectSize('h', $event)"
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
              <input class="swatch" type="color" :value="layer.color" title="图层颜色" @change="setLayerColor(layer.id, $event)" />
              <input :value="layer.name" @change="renameLayer(layer.id, $event)" />
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
      </div>

      <div v-else class="panel-page">
        <section>
          <div class="section-heading">
            <h2>约束</h2>
            <span class="constraint-total">{{ constraints.length }}</span>
          </div>

          <div class="constraint-grid">
            <button
              v-for="item in constraintTools"
              :key="item.id"
              class="constraint-tool"
              :class="{ active: activeConstraintTool === item.id }"
              :title="item.title"
              @click="selectConstraintTool(item.id)"
            >
              <span class="constraint-icon">{{ item.icon }}</span>
              <span>{{ item.label }}</span>
            </button>
          </div>

          <div v-if="activeConstraintToolData" class="constraint-editor">
            <template v-if="activeConstraintToolData.target === 'line'">
              <div class="field">
                <label>目标直线</label>
                <select v-model.number="pendingConstraint.entityId">
                  <option v-for="option in lineRefOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                  <option v-if="!lineRefOptions.length" value="" disabled>暂无直线</option>
                </select>
              </div>
            </template>

            <template v-else-if="activeConstraintToolData.target === 'line-pair'">
              <div class="field">
                <label>直线 A</label>
                <select v-model.number="pendingConstraint.entityId" @change="syncPendingAngle">
                  <option v-for="option in lineRefOptions" :key="`a-${option.value}`" :value="option.value">
                    {{ option.label }}
                  </option>
                  <option v-if="!lineRefOptions.length" value="" disabled>暂无直线</option>
                </select>
              </div>
              <div class="field">
                <label>直线 B</label>
                <select v-model.number="pendingConstraint.entityIdB" @change="syncPendingAngle">
                  <option v-for="option in lineRefOptions" :key="`b-${option.value}`" :value="option.value">
                    {{ option.label }}
                  </option>
                  <option v-if="!lineRefOptions.length" value="" disabled>暂无直线</option>
                </select>
              </div>
              <div v-if="activeConstraintTool === 'angle'" class="field">
                <label>夹角 °</label>
                <input
                  type="number"
                  step="0.1"
                  v-model.number="pendingConstraint.angle"
                />
              </div>
            </template>

            <template v-else-if="activeConstraintToolData.target === 'point'">
              <div class="field">
                <label>目标点</label>
                <select v-model="pendingConstraint.refA">
                  <option v-for="option in pointRefOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                  <option v-if="!pointRefOptions.length" value="" disabled>暂无可选点</option>
                </select>
              </div>
            </template>

            <template v-else-if="activeConstraintToolData.target === 'point-pair'">
              <div class="field">
                <label>点 A</label>
                <select v-model="pendingConstraint.refA">
                  <option v-for="option in pointRefOptions" :key="`a-${option.value}`" :value="option.value">
                    {{ option.label }}
                  </option>
                  <option v-if="!pointRefOptions.length" value="" disabled>暂无可选点</option>
                </select>
              </div>
              <div class="field">
                <label>点 B</label>
                <select v-model="pendingConstraint.refB">
                  <option v-for="option in pointRefOptions" :key="`b-${option.value}`" :value="option.value">
                    {{ option.label }}
                  </option>
                  <option v-if="!pointRefOptions.length" value="" disabled>暂无可选点</option>
                </select>
              </div>
            </template>

            <div class="constraint-actions">
              <button :disabled="!canCreatePendingConstraint" @click="createConstraintFromPending">添加</button>
              <button class="ghost" @click="cancelConstraintTool">取消</button>
            </div>
          </div>

          <div v-if="constraints.length" class="constraint-list">
            <div v-for="constraint in constraints" :key="constraint.id" class="constraint-row">
              <span class="constraint-badge">{{ constraintIcon(constraint.type) }}</span>
              <div>
                <strong>{{ constraintName(constraint.type) }}</strong>
                <span>{{ constraintSummary(constraint) }}</span>
              </div>
              <button title="删除约束" @click="removeConstraint(constraint.id)">×</button>
            </div>
          </div>
          <p v-else class="empty">暂无约束</p>
        </section>
      </div>
    </aside>

    <div
      v-if="contextMenu"
      ref="contextMenuRef"
      class="context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @contextmenu.prevent
      @pointerdown.stop
    >
      <button type="button" @click="copySelected">复制</button>
      <button type="button" class="danger-item" @click="deleteFromMenu">删除</button>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue';
import type {
  Point,
  Bounds,
  Entity,
  LineEntity,
  ArcEntity,
  TriangleEntity,
  PolylineEntity,
  Constraint,
  ConstraintRef,
  ConstraintType,
  Layer,
  ToolId,
  DrawingToolId,
  Draft,
  DragState,
  HandleDragState,
  LassoState,
  HistorySnapshot,
  PendingConstraint,
  OrientationActive,
  Handle,
  ToolDef,
  ConstraintToolDef,
  PanelMode,
  RefOption
} from './types/cad';
import { solveConstraints } from './solver';

const stageRef = ref<HTMLElement | null>(null);
const glCanvasRef = ref<HTMLCanvasElement | null>(null);
const labelCanvasRef = ref<HTMLCanvasElement | null>(null);

const tools: ToolDef[] = [
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

// 在这里添加约束
const constraintTools: ConstraintToolDef[] = [
  { id: 'coincident', label: '重合', icon: '◎', title: '两点保持同一位置', target: 'point-pair' },
  { id: 'horizontal', label: '水平', icon: '—', title: '直线保持水平', target: 'line' },
  { id: 'vertical', label: '垂直', icon: '│', title: '直线保持垂直', target: 'line' },
  { id: 'fixed', label: '固定', icon: '⌖', title: '点保持当前位置', target: 'point' },
  { id: 'parallel', label: '平行', icon: '//', title: '两直线保持平行', target: 'line-pair' },
  { id: 'perpendicular', label: '正交', icon: '⊥', title: '两直线互相垂直', target: 'line-pair' },
  { id: 'equalLength', label: '等长', icon: '=', title: '两直线保持等长', target: 'line-pair' },
  { id: 'angle', label: '角度', icon: '∠', title: '两直线保持指定夹角', target: 'line-pair' },
];
const layerColors = ['#111111', '#1a7a45', '#1d4ed8', '#b45309', '#b42318', '#6d28d9', '#0f766e'];

const tool = ref<ToolId>('select');
const gridSize = 25;
const ENTITY_LINE_WIDTH = 3;
const snapEnabled = true;
const entities = reactive<Entity[]>([]);
const constraints = reactive<Constraint[]>([]);
const layers = reactive<Layer[]>([
  { id: 1, name: '默认', color: '#111111', visible: true, locked: false },
  { id: 2, name: '尺寸', color: '#1a7a45', visible: true, locked: false },
  { id: 3, name: '辅助线', color: '#1d4ed8', visible: true, locked: false },
]);
const currentLayerId = ref(1);
const panelMode = ref<PanelMode>('properties');
const selectedIds = ref<number[]>([]);
const pointer = reactive<Point>({ x: 0, y: 0 });
const draft = ref<Draft | null>(null);
const drag = ref<DragState | null>(null);
const handleDrag = ref<HandleDragState | null>(null);
const lasso = ref<LassoState | null>(null);
const contextMenu = ref<{ x: number; y: number } | null>(null);
const contextMenuRef = ref<HTMLElement | null>(null);

// 当前的约束类型；null：没选任何约束工具
const activeConstraintTool = ref<ConstraintType | null>(null);

// pendingConstraint 是下拉框当前选中的值（v-model 绑的）
const pendingConstraint = reactive<PendingConstraint>({
  entityId: '',
  entityIdB: '',
  refA: '',
  refB: '',
  angle: 45,
});
const undoStack = ref<HistorySnapshot[]>([]);
const redoStack = ref<HistorySnapshot[]>([]);

let gl: WebGLRenderingContext | null = null;
let program: WebGLProgram | null = null;
let positionLocation: number | null = null;
let resolutionLocation: WebGLUniformLocation | null = null;
let colorLocation: WebGLUniformLocation | null = null;
let buffer: WebGLBuffer | null = null;
let nextId = 1;
let nextLayerId = 4;
let nextConstraintId = 1;

const selectedId = computed(() => selectedIds.value[0] ?? null);
const selectedEntity = computed(() => entities.find((item) => item.id === selectedId.value) || null);
const selectedEntities = computed(() => entities.filter((item) => selectedIds.value.includes(item.id)));

//属性->对象 下面的列表
const visibleEntities = computed(() =>
    entities.filter((entity) => isLayerVisible(entity.layerId))
);

//大概这样： { id: 'fixed', label: '固定', icon: '⌖', title: '点保持当前位置', target: 'point' }
const activeConstraintToolData = computed(() =>
    constraintTools.find((item) => item.id === activeConstraintTool.value) || null
);

// lineRefOptions 是水平/垂直约束用的「目标直线」下拉选项
const lineRefOptions = computed(() =>
  visibleEntities.value
    .filter((entity) => entity.type === 'line' && !isLayerLocked(entity.layerId))
    .map((entity) => ({ value: entity.id, label: `${entityName(entity)} #${entity.id}` })),
);

// 选中约束后约束目标的下拉列表
const pointRefOptions = computed(() =>
  visibleEntities.value
    .filter((entity) => !isLayerLocked(entity.layerId))
    .flatMap((entity) => constraintPointRefs(entity)),
);
const canCreatePendingConstraint = computed(() => {
  const toolData = activeConstraintToolData.value;
  if (!toolData) return false;
  if (toolData.target === 'line') {
    return lineRefOptions.value.some((option) => option.value === Number(pendingConstraint.entityId));
  }
  if (toolData.target === 'line-pair') {
    const a = Number(pendingConstraint.entityId);
    const b = Number(pendingConstraint.entityIdB);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return false;
    const ids = new Set(lineRefOptions.value.map((option) => option.value));
    if (!ids.has(a) || !ids.has(b)) return false;
    if (toolData.id === 'angle') return Number.isFinite(Number(pendingConstraint.angle));
    return true;
  }
  if (toolData.target === 'point') return Boolean(pendingConstraint.refA);
  if (toolData.target === 'point-pair') {
    return Boolean(pendingConstraint.refA && pendingConstraint.refB && pendingConstraint.refA !== pendingConstraint.refB);
  }
  return false;
});
const canUndo = computed(() => undoStack.value.length > 0);
const canRedo = computed(() => redoStack.value.length > 0);
const selectionText = computed(() => {
  if (!selectedIds.value.length) return '';
  if (selectedIds.value.length === 1 && selectedEntity.value) {
    return `${entityName(selectedEntity.value)} #${selectedEntity.value.id}`;
  }
  const names = selectedEntities.value.map((entity) => `${entityName(entity)} #${entity.id}`);
  if (names.length <= 3) return names.join('、');
  return `${names.slice(0, 2).join('、')} 等 ${names.length} 个`;
});
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

function setTool(nextTool: ToolId) {
  tool.value = nextTool;
  draft.value = null;
  drag.value = null;
  handleDrag.value = null;
  lasso.value = null;
  render();
}

function selectEntity(id: number) {
  const entity = entities.find((item) => item.id === id);
  if (!entity || !isLayerVisible(entity.layerId) || isLayerLocked(entity.layerId)) return;
  selectedIds.value = [id];
  tool.value = 'select';
  render();
}

function isSelected(id: number) {
  return selectedIds.value.includes(id);
}

function entityName(entity: Entity) {
  if (entity.type === 'line') return '直线';
  if (entity.type === 'circle') return '圆';
  if (entity.type === 'ellipse') return '椭圆';
  if (entity.type === 'arc') return '圆弧';
  if (entity.type === 'triangle') return '三角形';
  if (entity.type === 'polyline') return '多段线';
  return '矩形';
}

function constraintName(type: ConstraintType) {
  const toolData = constraintTools.find((item) => item.id === type);
  return toolData?.label || '约束';
}

function constraintIcon(type: ConstraintType) {
  const toolData = constraintTools.find((item) => item.id === type);
  return toolData?.icon || '?';
}

// 选中某个约束类型：比如水平
function selectConstraintTool(type: ConstraintType) {
  activeConstraintTool.value = activeConstraintTool.value === type ? null : type;
  if (activeConstraintTool.value) {
    primePendingConstraint(activeConstraintTool.value);
  }
}

function cancelConstraintTool() {
  activeConstraintTool.value = null;
}

/*
  {value: '1:start', label: '直线 #1 / 起点'}
  {value: '1:end', label: '直线 #1 / 终点'}
  {value: '2:center', label: '圆 #2 / 中心'}
*/
function primePendingConstraint(type: ConstraintType) {
  pendingConstraint.entityId = '';
  pendingConstraint.entityIdB = '';
  pendingConstraint.refA = '';
  pendingConstraint.refB = '';
  pendingConstraint.angle = 45;

  const selectedLines = selectedEntities.value.filter((entity) => entity.type === 'line');
  if (type === 'horizontal' || type === 'vertical') {
    const fallback = lineRefOptions.value[0]?.value;
    pendingConstraint.entityId = selectedLines[0]?.id ?? (typeof fallback === 'number' ? fallback : '');
    return;
  }
  if (type === 'parallel' || type === 'perpendicular' || type === 'equalLength' || type === 'angle') {
    const fallbackA = lineRefOptions.value[0]?.value;
    const fallbackB = lineRefOptions.value[1]?.value;
    pendingConstraint.entityId = selectedLines[0]?.id ?? (typeof fallbackA === 'number' ? fallbackA : '');
    pendingConstraint.entityIdB = selectedLines[1]?.id
      ?? (typeof fallbackB === 'number' ? fallbackB : '');
    if (pendingConstraint.entityId === pendingConstraint.entityIdB) {
      pendingConstraint.entityIdB = typeof fallbackB === 'number' ? fallbackB : '';
    }
    if (type === 'angle') syncPendingAngle();
    return;
  }
  const preferredPoints = selectedEntities.value.flatMap(
        (entity) => constraintPointRefs(entity)
  );
  const options = preferredPoints.length ? preferredPoints : pointRefOptions.value;

  // pendingConstraint 是下拉框当前选中的值（v-model 绑的）,这里采用第一个值
  pendingConstraint.refA = String(options[0]?.value ?? '');
  pendingConstraint.refB = String(options[1]?.value ?? '');
}

// 已知实体 + 手柄名，查出这个点当前的画布坐标。
function getPointByHandle(entity: Entity, handle: string): Point | null {
  const hit = selectionHandles(entity).find((h) => h.key === handle);
  return hit ? { x: hit.x, y: hit.y } : null;
}

//触发：点击“添加按钮”
// 把面板里选好的目标，落成一条真正的约束。
function createConstraintFromPending() {
  // 当前的约束参数数据
  const toolData = activeConstraintToolData.value;
  if (!toolData || !canCreatePendingConstraint.value) return;

  const constraint: Constraint = {
    id: nextConstraintId++,
    type: toolData.id,
    refs: [],
  };

  if (toolData.target === 'line') {
    constraint.refs = [{ entityId: Number(pendingConstraint.entityId) }];
  } else if (toolData.target === 'line-pair') {
    constraint.refs = [
      { entityId: Number(pendingConstraint.entityId) },
      { entityId: Number(pendingConstraint.entityIdB) },
    ];
    if (toolData.id === 'angle') constraint.value = Number(pendingConstraint.angle);
  } else if (toolData.target === 'point') {
    const ref = decodePointRef(pendingConstraint.refA);
    const entity = entities.find((e) => e.id === ref.entityId);
    const pt = entity && ref.handle ? getPointByHandle(entity, ref.handle) : null;
    if (!pt) return;
    constraint.refs = [{ ...ref, x: pt.x, y: pt.y }];

  } else if (toolData.target === 'point-pair') {
    constraint.refs = [decodePointRef(pendingConstraint.refA), decodePointRef(pendingConstraint.refB)];
  }

  recordHistory();
  removeRedundantDirectionalConstraints(constraint);
  removeRedundantCoincident(constraint);
  removeRedundantAngle(constraint);
  // 加入约束列表
  constraints.push(constraint);
  if (constraint.type === 'fixed') {
    applyFixedConstraint({ entityId: constraint.refs[0]?.entityId });
  }
  solveConstraints(entities, constraints);
  activeConstraintTool.value = null;
  render();
}

function removeRedundantDirectionalConstraints(nextConstraint: Constraint) {
  if (nextConstraint.type !== 'horizontal' && nextConstraint.type !== 'vertical') return;
  const entityId = nextConstraint.refs[0]?.entityId;
  if (!entityId) return;
  for (let i = constraints.length - 1; i >= 0; i -= 1) {
    const constraint = constraints[i];
    const isSameLine = constraint.refs[0]?.entityId === entityId;
    const isDirectional = constraint.type === 'horizontal' || constraint.type === 'vertical';
    if (isSameLine && isDirectional) constraints.splice(i, 1);
  }
}

function pointRefKey(ref?: ConstraintRef) {
  return ref ? `${ref.entityId}:${ref.handle ?? ''}` : '';
}

function removeRedundantAngle(nextConstraint: Constraint) {
  if (nextConstraint.type !== 'angle') return;
  const a = nextConstraint.refs[0]?.entityId;
  const b = nextConstraint.refs[1]?.entityId;
  if (!a || !b) return;
  for (let i = constraints.length - 1; i >= 0; i -= 1) {
    const constraint = constraints[i];
    if (constraint.type !== 'angle') continue;
    const ids = new Set(constraint.refs.map((ref) => ref.entityId));
    if (ids.has(a) && ids.has(b)) constraints.splice(i, 1);
  }
}

function directedLineAngle(a: LineEntity, b: LineEntity) {
  const dx1 = a.x2 - a.x1;
  const dy1 = a.y2 - a.y1;
  const dx2 = b.x2 - b.x1;
  const dy2 = b.y2 - b.y1;
  if (Math.hypot(dx1, dy1) < 1e-9 || Math.hypot(dx2, dy2) < 1e-9) return 45;
  return Math.atan2(dx1 * dy2 - dy1 * dx2, dx1 * dx2 + dy1 * dy2) * 180 / Math.PI;
}

function syncPendingAngle() {
  if (activeConstraintTool.value !== 'angle') return;
  const a = entities.find((entity): entity is LineEntity => entity.id === Number(pendingConstraint.entityId) && entity.type === 'line');
  const b = entities.find((entity): entity is LineEntity => entity.id === Number(pendingConstraint.entityIdB) && entity.type === 'line');
  if (!a || !b || a.id === b.id) {
    pendingConstraint.angle = 45;
    return;
  }
  pendingConstraint.angle = Math.round(directedLineAngle(a, b) * 10) / 10;
}

function removeRedundantCoincident(nextConstraint: Constraint) {
  if (nextConstraint.type !== 'coincident') return;
  const a = pointRefKey(nextConstraint.refs[0]);
  const b = pointRefKey(nextConstraint.refs[1]);
  if (!a || !b) return;
  for (let i = constraints.length - 1; i >= 0; i -= 1) {
    const constraint = constraints[i];
    if (constraint.type !== 'coincident') continue;
    const ca = pointRefKey(constraint.refs[0]);
    const cb = pointRefKey(constraint.refs[1]);
    if ((ca === a && cb === b) || (ca === b && cb === a)) constraints.splice(i, 1);
  }
}

// 固定约束：fixed (目前只针对直线起作用)
function applyFixedConstraint(active: OrientationActive = {}){
  for (const constraint of constraints) {
    if (constraint.type !== 'fixed') {
      continue;
    }
    const entityId = constraint.refs[0]?.entityId;
    if (active.entityId && entityId !== active.entityId) {
      continue;
    }
    enforceLineFixedConstraint(constraint, active);
  }
}

// 点固定
function enforceLineFixedConstraint(constraint: Constraint, active: OrientationActive = {}){
  if(constraint.type!='fixed') return;

  const entityId = constraint.refs[0]?.entityId;
  //拿到当前的entity
  const entity = entities.find((item) => item.id === entityId);
  if (!entity || entity.type !== 'line') return;
  const activeHandle = active.entityId === entity.id ? active.handle : null;

  // constraints.ref[0]里面的x,y是创建这条固定约束时记下的坐标
  const ref = constraint.refs[0];
  if (!ref?.handle || ref.x == null || ref.y == null) return;

  if (ref.handle === 'start') {
    entity.x1 = ref.x;
    entity.y1 = ref.y;
  }
  if (ref.handle === 'end') {
    entity.x2 = ref.x;
    entity.y2 = ref.y;
  }

}

function removeConstraint(id: number) {
  const index = constraints.findIndex((constraint) => constraint.id === id);
  if (index < 0) return;
  recordHistory();
  constraints.splice(index, 1);
  render();
}

function constraintSummary(constraint: Constraint) {
  if (constraint.type === 'horizontal' || constraint.type === 'vertical') {
    return constraintEntityLabel(constraint.refs[0]?.entityId);
  }
  if (constraint.type === 'parallel') {
    return `${constraintEntityLabel(constraint.refs[0]?.entityId)} ∥ ${constraintEntityLabel(constraint.refs[1]?.entityId)}`;
  }
  if (constraint.type === 'perpendicular') {
    return `${constraintEntityLabel(constraint.refs[0]?.entityId)} ⊥ ${constraintEntityLabel(constraint.refs[1]?.entityId)}`;
  }
  if (constraint.type === 'equalLength') {
    return `${constraintEntityLabel(constraint.refs[0]?.entityId)} 等长 ${constraintEntityLabel(constraint.refs[1]?.entityId)}`;
  }
  if (constraint.type === 'angle') {
    const degrees = Number.isFinite(constraint.value) ? constraint.value : 0;
    return `${constraintEntityLabel(constraint.refs[0]?.entityId)} ∠ ${constraintEntityLabel(constraint.refs[1]?.entityId)} = ${degrees}°`;
  }
  if (constraint.type === 'fixed') {
    return constraintPointLabel(constraint.refs[0]);
  }
  if (constraint.type === 'coincident') {
    return `${constraintPointLabel(constraint.refs[0])} = ${constraintPointLabel(constraint.refs[1])}`;
  }
  return constraint.refs.map((ref) => constraintPointLabel(ref)).join(', ');
}

function constraintEntityLabel(entityId?: number) {
  const entity = entities.find((item) => item.id === entityId);
  return entity ? `${entityName(entity)} #${entity.id}` : `对象 #${entityId}`;
}

function constraintPointLabel(ref?: ConstraintRef) {
  if (!ref) return '未指定';
  const entity = entities.find((item) => item.id === ref.entityId);
  const name = entity ? `${entityName(entity)} #${entity.id}` : `对象 #${ref.entityId}`;
  return `${name} / ${handleLabel(ref.handle)}`;
}

// 给某个图形列出「能拿来做点约束」的选项，供下拉框用
function constraintPointRefs(entity: Entity): RefOption[] {
  const handles: string[] = [];
  if (entity.type === 'line') {
    handles.push('start', 'end');
  } else if (entity.type === 'circle' || entity.type === 'ellipse') {
    handles.push('center');
  } else if (entity.type === 'arc' || entity.type === 'triangle' || entity.type === 'polyline') {
    for (let i = 0; i < entity.points.length; i += 1) handles.push(`p${i}`);
  } else {
    handles.push('nw', 'ne', 'se', 'sw');
  }

  /*
  *   类似 {label: xx, value: "1:start"}
  * */
  return handles.map((handle) => ({
    value: encodePointRef({ entityId: entity.id, handle }),
    label: `${entityName(entity)} #${entity.id} / ${handleLabel(handle)}`,
  }));
}

function encodePointRef(ref: ConstraintRef) {
  return `${ref.entityId}:${ref.handle}`;
}

function decodePointRef(value: string): ConstraintRef {
  const [entityId, handle] = String(value).split(':');
  return { entityId: Number(entityId), handle };
}

function handleLabel(handle?: string) {
  const labels: Record<string, string> = {
    start: '起点',
    end: '终点',
    center: '中心',
    nw: '左上',
    ne: '右上',
    se: '右下',
    sw: '左下',
  };
  if (handle && labels[handle]) return labels[handle];
  if (handle?.startsWith('p')) return `点 ${Number(handle.slice(1)) + 1}`;
  return handle || '点';
}

function lineLength(line: LineEntity) {
  return Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
}

function arcLength(entity: ArcEntity) {
  const geometry = arcGeometry(entity.points[0], entity.points[1], entity.points[2]);
  return geometry ? Math.abs(geometry.sweep) * geometry.r : pathLength(entity.points);
}

function entityPathLength(entity: TriangleEntity | PolylineEntity) {
  if (entity.type === 'triangle') return pathLength(closedPath(entity.points));
  return pathLength(entity.points);
}

function setLineLength(event: Event) {
  const entity = selectedEntity.value;
  const value = Number((event.target as HTMLInputElement).value);
  if (!entity || entity.type !== 'line' || !Number.isFinite(value) || value <= 0) return;
  recordHistory();
  const length = lineLength(entity) || 1;
  const dx = (entity.x2 - entity.x1) / length;
  const dy = (entity.y2 - entity.y1) / length;
  entity.x2 = entity.x1 + dx * value;
  entity.y2 = entity.y1 + dy * value;
  solveConstraints(entities, constraints, { pinEntityIds: [entity.id] });
  render();
}

function setCircleRadius(event: Event) {
  const entity = selectedEntity.value;
  const value = Number((event.target as HTMLInputElement).value);
  if (!entity || entity.type !== 'circle' || !Number.isFinite(value) || value <= 0) return;
  recordHistory();
  entity.r = value;
  render();
}

function setEllipseRadius(axis: 'rx' | 'ry', event: Event) {
  const entity = selectedEntity.value;
  const value = Number((event.target as HTMLInputElement).value);
  if (!entity || entity.type !== 'ellipse' || !Number.isFinite(value) || value <= 0) return;
  recordHistory();
  entity[axis] = value;
  render();
}

function setRectSize(axis: 'w' | 'h', event: Event) {
  const entity = selectedEntity.value;
  const value = Number((event.target as HTMLInputElement).value);
  if (!entity || entity.type !== 'rect' || !Number.isFinite(value) || value <= 0) return;
  recordHistory();
  entity[axis] = Math.sign(entity[axis] || 1) * value;
  render();
}

function setSelectedLayer(event: Event) {
  const entity = selectedEntity.value;
  const layerId = Number((event.target as HTMLSelectElement).value);
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

function renameLayer(id: number, event: Event) {
  const layer = layerById(id);
  const name = (event.target as HTMLInputElement).value.trim();
  if (!layer || !name || layer.name === name) return;
  recordHistory();
  layer.name = name;
}

function setLayerColor(id: number, event: Event) {
  const layer = layerById(id);
  const color = (event.target as HTMLInputElement).value;
  if (!layer || layer.color === color) return;
  recordHistory();
  layer.color = color;
  render();
}

function toggleLayerVisible(id: number) {
  const layer = layerById(id);
  if (!layer) return;
  recordHistory();
  layer.visible = !layer.visible;
  clearInvalidSelection();
  render();
}

function toggleLayerLocked(id: number) {
  const layer = layerById(id);
  if (!layer) return;
  recordHistory();
  layer.locked = !layer.locked;
  clearInvalidSelection();
  render();
}

function layerById(id: number) {
  return layers.find((layer) => layer.id === Number(id));
}

function entityLayer(entity: { layerId: number }): Layer {
  return layerById(entity.layerId) || layers[0];
}

function isLayerVisible(id: number) {
  return entityLayer({ layerId: id }).visible;
}

function isLayerLocked(id: number) {
  return entityLayer({ layerId: id }).locked;
}

function clearInvalidSelection() {
  selectedIds.value = selectedIds.value.filter((id) => {
    const entity = entities.find((item) => item.id === id);
    return !!entity && isLayerVisible(entity.layerId) && !isLayerLocked(entity.layerId);
  });
}

function deleteSelected() {
  if (!selectedIds.value.length) return;
  recordHistory();
  const selected = new Set(selectedIds.value);
  for (let i = entities.length - 1; i >= 0; i -= 1) {
    if (selected.has(entities[i].id)) entities.splice(i, 1);
  }
  for (let i = constraints.length - 1; i >= 0; i -= 1) {
    if (constraintTouchesEntities(constraints[i], selected)) constraints.splice(i, 1);
  }
  selectedIds.value = [];
  render();
}

function recordHistory() {
  undoStack.value.push({
    entities: cloneEntities(),
    constraints: cloneConstraints(),
    layers: cloneLayers(),
    currentLayerId: currentLayerId.value,
    selectedIds: [...selectedIds.value],
    nextId,
    nextLayerId,
    nextConstraintId,
  });
  redoStack.value = [];
}

function undo() {
  const snapshot = undoStack.value.pop();
  if (!snapshot) return;
  redoStack.value.push({
    entities: cloneEntities(),
    constraints: cloneConstraints(),
    layers: cloneLayers(),
    currentLayerId: currentLayerId.value,
    selectedIds: [...selectedIds.value],
    nextId,
    nextLayerId,
    nextConstraintId,
  });
  restoreSnapshot(snapshot);
}

function redo() {
  const snapshot = redoStack.value.pop();
  if (!snapshot) return;
  undoStack.value.push({
    entities: cloneEntities(),
    constraints: cloneConstraints(),
    layers: cloneLayers(),
    currentLayerId: currentLayerId.value,
    selectedIds: [...selectedIds.value],
    nextId,
    nextLayerId,
    nextConstraintId,
  });
  restoreSnapshot(snapshot);
}

function restoreSnapshot(snapshot: HistorySnapshot) {
  entities.splice(0, entities.length, ...snapshot.entities.map((entity) => cloneEntity(entity)));
  constraints.splice(0, constraints.length, ...(snapshot.constraints ?? []).map((constraint) => cloneConstraint(constraint)));
  layers.splice(0, layers.length, ...snapshot.layers.map((layer) => ({ ...layer })));
  currentLayerId.value = snapshot.currentLayerId;
  selectedIds.value = snapshot.selectedIds.filter((id) => entities.some((entity) => entity.id === id));
  nextId = snapshot.nextId;
  nextLayerId = snapshot.nextLayerId;
  nextConstraintId = snapshot.nextConstraintId ?? nextConstraintId;
  draft.value = null;
  drag.value = null;
  handleDrag.value = null;
  lasso.value = null;
  activeConstraintTool.value = null;
  render();
}

function cloneEntities() {
  return entities.map((entity) => cloneEntity(entity));
}

function cloneConstraints() {
  return constraints.map((constraint) => cloneConstraint(constraint));
}

function cloneLayers() {
  return layers.map((layer) => ({ ...layer }));
}

function initWebGL() {
  const canvas = glCanvasRef.value;
  if (!canvas) throw new Error('WebGL canvas is missing');
  gl = canvas.getContext('webgl', { antialias: true });
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
  if (!program) throw new Error('Failed to create WebGL program');
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'Program link failed');
  }

  positionLocation = gl.getAttribLocation(program, 'a_position');
  resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
  colorLocation = gl.getUniformLocation(program, 'u_color');
  buffer = gl.createBuffer();
}

function compileShader(type: number, source: string) {
  if (!gl) throw new Error('WebGL is not initialized');
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || 'Shader compile failed');
  }
  return shader;
}

function resize() {
  const stage = stageRef.value;
  const glCanvas = glCanvasRef.value;
  const labelCanvas = labelCanvasRef.value;
  if (!stage || !glCanvas || !labelCanvas) return;
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

function screenPoint(event: { clientX: number; clientY: number }, options: { snap?: boolean } = {}) {
  const canvas = glCanvasRef.value;
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const shouldSnap = options.snap ?? snapEnabled;
  const point = shouldSnap ? snapPoint({ x, y }) : { x, y };
  pointer.x = point.x;
  pointer.y = point.y;
  return point;
}

function snapPoint(point: Point) {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  };
}

function closeContextMenu() {
  contextMenu.value = null;
}

function onContextMenu(event: MouseEvent) {
  event.preventDefault();
  const point = screenPoint(event, { snap: false });
  const hit = pickHandle(point)?.entity ?? pick(point);
  if (!hit) {
    closeContextMenu();
    return;
  }
  if (!isSelected(hit.id)) selectedIds.value = [hit.id];
  contextMenu.value = {
    x: Math.min(event.clientX, window.innerWidth - 148),
    y: Math.min(event.clientY, window.innerHeight - 84),
  };
  render();
}

function copySelected() {
  if (!selectedIds.value.length) return;
  recordHistory();
  const offset = gridSize;
  const copies: Entity[] = [];
  for (const entity of selectedEntities.value) {
    const copy = cloneEntity(entity);
    copy.id = nextId++;
    moveEntityFromOriginal(copy, entity, offset, offset);
    copies.push(copy);
  }
  entities.push(...copies);
  selectedIds.value = copies.map((entity) => entity.id);
  closeContextMenu();
  render();
}

function deleteFromMenu() {
  closeContextMenu();
  deleteSelected();
}

function onDocumentPointerDown(event: PointerEvent) {
  const menu = contextMenuRef.value;
  if (menu && event.target instanceof Node && menu.contains(event.target)) return;
  closeContextMenu();
}

function onPointerDown(event: PointerEvent) {
  closeContextMenu();
  if (event.button !== 0) return;
  glCanvasRef.value?.setPointerCapture(event.pointerId);
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
      if (!isSelected(handleHit.entity.id)) {
        selectedIds.value = [handleHit.entity.id];
      }
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
    draft.value = createDraft(tool.value as DrawingToolId, point);
    render();
    return;
  }

  updateDraftPoint(draft.value, point);
  if (draftReadyToCommit(draft.value)) commitDraft();
  else render();
}

// 鼠标移动 / 移动object
function onPointerMove(event: PointerEvent) {

  // 鼠标当前移动到的点
  const point = screenPoint(event, { snap: tool.value !== 'lasso' });

  // handleDrag: 当前移动的handle点的信息,包括entityId等
  if (handleDrag.value) {
    if (!handleDrag.value.historyRecorded) {
      recordHistory();
      handleDrag.value.historyRecorded = true;
    }
    const entity = entities.find((item) => item.id === handleDrag.value!.entityId);
    if (entity) {
      moveHandleFromOriginal(entity, handleDrag.value.original, handleDrag.value.handle, point);
      applyFixedConstraint({ entityId: entity.id, handle: handleDrag.value.handle });
      solveConstraints(entities, constraints, {
        drag: {
          entityId: entity.id,
          handle: handleDrag.value.handle,
          x: point.x,
          y: point.y,
        },
      });
    }
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
    solveConstraints(entities, constraints, {
      pinEntityIds: drag.value.originals.map((item) => item.id),
    });
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

function onPointerUp(event: PointerEvent) {
  const canvas = glCanvasRef.value;
  if (canvas?.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
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
  const points = lasso.value?.points;
  if (!points) {
    lasso.value = null;
    tool.value = 'select';
    render();
    return;
  }
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
  if (!draft.value) return;
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

function createDraft(nextTool: DrawingToolId, point: Point): Draft {
  if (nextTool === 'arc' || nextTool === 'triangle' || nextTool === 'polyline') {
    return { tool: nextTool, points: [point], current: point };
  }
  return { tool: nextTool, start: point, current: point };
}

function updateDraftPoint(value: Draft, point: Point) {
  if (value.tool === 'arc' || value.tool === 'triangle' || value.tool === 'polyline') {
    value.points.push(point);
    value.current = point;
    return;
  }
  value.current = point;
}

function draftReadyToCommit(value: Draft) {
  if (value.tool === 'arc' || value.tool === 'triangle') return value.points.length >= 3;
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

function entityFromDraft(value: Draft, assignId = true): Entity | null {
  const draftId = () => (assignId ? nextId++ : -1);
  const layerId = 1;
  if (value.tool === 'arc') {
    const points = draftPoints(value);
    if (points.length < 3 || !arcGeometry(points[0], points[1], points[2])) return null;
    return { id: draftId(), layerId, type: 'arc', points: points.slice(0, 3).map(clonePoint) };
  }
  if (value.tool === 'triangle') {
    const points = draftPoints(value);
    if (points.length < 3 || polygonArea(points.slice(0, 3)) === 0) return null;
    return { id: draftId(), layerId, type: 'triangle', points: points.slice(0, 3).map(clonePoint) };
  }
  if (value.tool === 'polyline') {
    const points = draftPoints(value);
    if (points.length < 2 || pathLength(points) <= 0) return null;
    return { id: draftId(), layerId, type: 'polyline', points: points.map(clonePoint) };
  }

  if (value.tool !== 'line' && value.tool !== 'circle' && value.tool !== 'ellipse' && value.tool !== 'rect') {
    return null;
  }
  const { start, current } = value;
  if (value.tool === 'line' && Math.hypot(current.x - start.x, current.y - start.y) > 0) {
    return { id: draftId(), layerId, type: 'line', x1: start.x, y1: start.y, x2: current.x, y2: current.y };
  }
  if (value.tool === 'circle') {
    const r = Math.hypot(current.x - start.x, current.y - start.y);
    if (r <= 0) return null;
    return { id: draftId(), layerId, type: 'circle', cx: start.x, cy: start.y, r };
  }
  if (value.tool === 'ellipse') {
    const rx = Math.abs(current.x - start.x);
    const ry = Math.abs(current.y - start.y);
    if (rx <= 0 || ry <= 0) return null;
    return { id: draftId(), layerId, type: 'ellipse', cx: start.x, cy: start.y, rx, ry };
  }
  if (value.tool === 'rect' && Math.abs(current.x - start.x) > 0 && Math.abs(current.y - start.y) > 0) {
    return { id: draftId(), layerId, type: 'rect', x: start.x, y: start.y, w: current.x - start.x, h: current.y - start.y };
  }
  return null;
}

function draftPoints(value: Draft) {
  const points = value.points ? value.points.map(clonePoint) : [];
  if (value.current && points.length && !samePoint(points[points.length - 1], value.current)) {
    points.push(clonePoint(value.current));
  }
  return points;
}

function moveEntityFromOriginal(entity: Entity, original: Entity, dx: number, dy: number) {
  if (entity.type === 'line' && original.type === 'line') {
    entity.x1 = original.x1 + dx;
    entity.y1 = original.y1 + dy;
    entity.x2 = original.x2 + dx;
    entity.y2 = original.y2 + dy;
  } else if (entity.type === 'circle' && original.type === 'circle') {
    entity.cx = original.cx + dx;
    entity.cy = original.cy + dy;
  } else if (entity.type === 'ellipse' && original.type === 'ellipse') {
    entity.cx = original.cx + dx;
    entity.cy = original.cy + dy;
  } else if (
    (entity.type === 'arc' || entity.type === 'triangle' || entity.type === 'polyline') &&
    entity.type === original.type
  ) {
    entity.points = original.points.map((item) => ({ x: item.x + dx, y: item.y + dy }));
  } else if (entity.type === 'rect' && original.type === 'rect') {
    entity.x = original.x + dx;
    entity.y = original.y + dy;
  }
}

function cloneEntity(entity: Entity): Entity {
  if (entity.type === 'line') {
    return { id: entity.id, type: 'line', layerId: entity.layerId ?? 1, x1: entity.x1, y1: entity.y1, x2: entity.x2, y2: entity.y2 };
  }
  if (entity.type === 'circle') {
    return { id: entity.id, type: 'circle', layerId: entity.layerId ?? 1, cx: entity.cx, cy: entity.cy, r: entity.r };
  }
  if (entity.type === 'ellipse') {
    return { id: entity.id, type: 'ellipse', layerId: entity.layerId ?? 1, cx: entity.cx, cy: entity.cy, rx: entity.rx, ry: entity.ry };
  }
  if (entity.type === 'arc' || entity.type === 'triangle' || entity.type === 'polyline') {
    return { id: entity.id, type: entity.type, layerId: entity.layerId ?? 1, points: entity.points.map(clonePoint) };
  }
  return { id: entity.id, type: 'rect', layerId: entity.layerId ?? 1, x: entity.x, y: entity.y, w: entity.w, h: entity.h };
}

function cloneConstraint(constraint: Constraint): Constraint {
  return {
    id: constraint.id,
    type: constraint.type,
    refs: constraint.refs.map((ref) => ({ ...ref })),
    value: constraint.value,
  };
}

function constraintTouchesEntities(constraint: Constraint, entityIds: Set<number>) {
  return constraint.refs.some((ref) => entityIds.has(ref.entityId));
}

function clonePoint(point: Point): Point {
  return { x: point.x, y: point.y };
}

function samePoint(a: Point, b: Point) {
  return a.x === b.x && a.y === b.y;
}


// point: 当前鼠标的最新位置
function moveHandleFromOriginal(entity: Entity, original: Entity, handle: string, point: Point) {
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

  if (entity.type === 'circle' && original.type === 'circle') {
    if (handle === 'center') {
      entity.cx = point.x;
      entity.cy = point.y;
    } else {
      entity.r = Math.max(1, Math.hypot(point.x - original.cx, point.y - original.cy));
    }
    return;
  }

  if (entity.type === 'ellipse' && original.type === 'ellipse') {
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

  if (entity.type !== 'rect') return;

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

function pick(point: Point): Entity | null {
  for (let i = entities.length - 1; i >= 0; i -= 1) {
    const entity = entities[i];
    if (!isLayerVisible(entity.layerId) || isLayerLocked(entity.layerId)) continue;
    if (hitEntity(entity, point)) return entity;
  }
  return null;
}

// 在当前选中的图形上，判断鼠标点有没有点中某个控制手柄（端点/中心/半径点等）。
function pickHandle(point: Point): { entity: Entity; handle: Handle } | null {
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

function hitEntity(entity: Entity, point: Point) {
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
    const verts = ellipsePointVertices(entity.cx, entity.cy, entity.rx, entity.ry);
    return normalized <= 1 || distanceToPath(point, verts) <= tolerance;
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

function distanceToSegment(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function distanceToPath(point: Point, points: Point[]) {
  if (points.length < 2) return Infinity;
  let min = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    min = Math.min(min, distanceToSegment(point, points[i - 1], points[i]));
  }
  return min;
}

function entityInsideLasso(entity: Entity, polygon: Point[]) {
  return entityTestPoints(entity).some((point) => pointInPolygon(point, polygon));
}

function entityTestPoints(entity: Entity): Point[] {
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

function pointInPolygon(point: Point, polygon: Point[]) {
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
  if (!gl || !program || positionLocation === null) return;
  const canvas = glCanvasRef.value;
  if (!canvas) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(1, 1, 1, 1);
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

function drawGrid(width: number, height: number) {
  const fine: number[] = [];
  for (let x = 0; x <= width; x += gridSize) fine.push(x, 0, x, height);
  for (let y = 0; y <= height; y += gridSize) fine.push(0, y, width, y);
  drawLines(fine, [0.88, 0.9, 0.92, 1]);

  const major: number[] = [];
  const majorStep = gridSize * 4;
  for (let x = 0; x <= width; x += majorStep) major.push(x, 0, x, height);
  for (let y = 0; y <= height; y += majorStep) major.push(0, y, width, y);
  drawLines(major, [0.76, 0.79, 0.83, 1]);
}

function drawEntity(entity: Entity, selected = false, preview = false) {
  const layer = entityLayer(entity);
  const color = selected ? [0.78, 0.52, 0.04, 1] : preview ? [0.18, 0.42, 0.82, 1] : hexToColor(layer.color);
  if (entity.type === 'line') {
    drawStroke([entity.x1, entity.y1, entity.x2, entity.y2], color, ENTITY_LINE_WIDTH);
  } else if (entity.type === 'circle') {
    drawStroke(circleVertices(entity.cx, entity.cy, entity.r), color, ENTITY_LINE_WIDTH, true);
  } else if (entity.type === 'ellipse') {
    drawStroke(ellipseVertices(entity.cx, entity.cy, entity.rx, entity.ry), color, ENTITY_LINE_WIDTH, true);
  } else if (entity.type === 'arc') {
    drawPath(arcVertices(entity.points[0], entity.points[1], entity.points[2]), color);
  } else if (entity.type === 'triangle') {
    drawPath(closedPath(entity.points), color);
  } else if (entity.type === 'polyline') {
    drawPath(entity.points, color);
  } else {
    const x2 = entity.x + entity.w;
    const y2 = entity.y + entity.h;
    drawStroke(
      [entity.x, entity.y, x2, entity.y, x2, entity.y, x2, y2, x2, y2, entity.x, y2, entity.x, y2, entity.x, entity.y],
      color,
      ENTITY_LINE_WIDTH,
    );
  }
}

function hexToColor(hex: string): number[] {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  return [r, g, b, 1];
}

function drawSelection(entity: Entity) {
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
  ], [0.85, 0.5, 0.05, 1]);

  for (const handle of selectionHandles(entity)) {
    drawHandle(handle.x, handle.y, handle.key === 'end' ? 'circle' : 'square');
  }
}

function drawLasso(points: Point[]) {
  if (points.length < 2) return;
  const vertices: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    vertices.push(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
  }
  const first = points[0];
  const last = points[points.length - 1];
  vertices.push(last.x, last.y, first.x, first.y);
  drawStroke(vertices, [0.15, 0.45, 0.85, 1], 2);
}

function entityBounds(entity: Entity): Bounds {
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

// 按图形类型算出选中后该显示、可拖的控制点列表。
// 每个手柄是 { key, x, y }：key 标识用途，x/y 是画布坐标。
function selectionHandles(entity: Entity): Handle[] {
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

function drawHandle(x: number, y: number, kind: 'square' | 'circle' = 'square') {
  const size = 5;
  const fill = kind === 'circle' ? [0.18, 0.45, 0.86, 1] : [0.95, 0.75, 0.15, 1];
  const stroke = [0.2, 0.16, 0.05, 1];
  if (kind === 'circle') {
    const tris: number[] = [];
    const ring: number[] = [];
    const segments = 16;
    for (let i = 0; i < segments; i += 1) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const x0 = x + Math.cos(a0) * size;
      const y0 = y + Math.sin(a0) * size;
      const x1 = x + Math.cos(a1) * size;
      const y1 = y + Math.sin(a1) * size;
      tris.push(x, y, x0, y0, x1, y1);
      ring.push(x0, y0);
    }
    drawTriangles(tris, fill);
    drawLines(ring, stroke, gl!.LINE_LOOP);
    return;
  }
  drawTriangles([
    x - size, y - size,
    x + size, y - size,
    x + size, y + size,
    x - size, y - size,
    x + size, y + size,
    x - size, y + size,
  ], fill);
  drawLines([
    x - size, y - size, x + size, y - size,
    x + size, y - size, x + size, y + size,
    x + size, y + size, x - size, y + size,
    x - size, y + size, x - size, y - size,
  ], stroke);
}

function circleVertices(cx: number, cy: number, r: number) {
  const verts: number[] = [];
  const segments = 96;
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    verts.push(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
  }
  return verts;
}

function ellipseVertices(cx: number, cy: number, rx: number, ry: number) {
  const verts: number[] = [];
  const segments = 96;
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    verts.push(cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry);
  }
  return verts;
}

function ellipsePointVertices(cx: number, cy: number, rx: number, ry: number): Point[] {
  const verts: Point[] = [];
  const segments = 96;
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    verts.push({
      x: cx + Math.cos(angle) * rx,
      y: cy + Math.sin(angle) * ry,
    });
  }
  return verts;
}

function arcVertices(start: Point, through: Point, end: Point): Point[] {
  const geometry = arcGeometry(start, through, end);
  if (!geometry) return [start, end].map(clonePoint);
  const verts: Point[] = [];
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

function arcGeometry(start: Point, through: Point, end: Point) {
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

function normalizeAngle(angle: number) {
  const full = Math.PI * 2;
  return ((angle % full) + full) % full;
}

function closedPath(points: Point[]) {
  if (!points.length) return [];
  return [...points.map(clonePoint), clonePoint(points[0])];
}

function pointsBounds(points: Point[]): Bounds {
  if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function polygonArea(points: Point[]) {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    area += points[i].x * next.y - next.x * points[i].y;
  }
  return Math.abs(area) / 2;
}

function pathLength(points: Point[]) {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return length;
}

function drawPath(points: Point[], color: number[]) {
  if (points.length < 2) return;
  const vertices: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    vertices.push(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
  }
  drawStroke(vertices, color, ENTITY_LINE_WIDTH);
}

function appendThickSegment(out: number[], x1: number, y1: number, x2: number, y2: number, width: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const hx = (-dy / len) * (width * 0.5);
  const hy = (dx / len) * (width * 0.5);
  out.push(
    x1 + hx, y1 + hy,
    x1 - hx, y1 - hy,
    x2 + hx, y2 + hy,
    x1 - hx, y1 - hy,
    x2 - hx, y2 - hy,
    x2 + hx, y2 + hy,
  );
}

function drawStroke(vertices: number[], color: number[], width: number, loop = false) {
  if (!gl || vertices.length < 4) return;
  if (width <= 1.01) {
    drawLines(vertices, color, loop ? gl.LINE_LOOP : undefined);
    return;
  }
  const tris: number[] = [];
  if (loop) {
    const count = vertices.length / 2;
    for (let i = 0; i < count; i += 1) {
      const j = (i + 1) % count;
      appendThickSegment(tris, vertices[i * 2], vertices[i * 2 + 1], vertices[j * 2], vertices[j * 2 + 1], width);
    }
  } else {
    for (let i = 0; i + 3 < vertices.length; i += 4) {
      appendThickSegment(tris, vertices[i], vertices[i + 1], vertices[i + 2], vertices[i + 3], width);
    }
  }
  drawTriangles(tris, color);
}

function drawLines(vertices: number[], color: number[], mode?: number) {
  if (!gl) return;
  const drawMode = mode ?? gl.LINES;
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
  gl.uniform4fv(colorLocation, color);
  gl.drawArrays(drawMode, 0, vertices.length / 2);
}

function drawTriangles(vertices: number[], color: number[]) {
  if (!gl) return;
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
  gl.uniform4fv(colorLocation, color);
  gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 2);
}

function renderLabelsOnly() {
  const canvas = labelCanvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

  ctx.font = '12px Inter, sans-serif';
  ctx.lineWidth = 1;
  ctx.textBaseline = 'middle';

  for (const entity of entities) {
    if (!isLayerVisible(entity.layerId)) continue;
    drawDimension(ctx, entity);
    if (entity.type === 'line' && shouldShowEndpointLabels(entity)) drawEndpointLabels(ctx, entity);
  }
}

function shouldShowEndpointLabels(entity: Entity) {
  if (entity.type !== 'line') return false;
  if (isSelected(entity.id)) return true;
  return activeConstraintTool.value === 'coincident' || activeConstraintTool.value === 'fixed';
}

function drawEndpointLabels(ctx: CanvasRenderingContext2D, entity: LineEntity) {
  drawEndpointName(ctx, '起', entity.x1, entity.y1, entity.x2, entity.y2);
  drawEndpointName(ctx, '终', entity.x2, entity.y2, entity.x1, entity.y1);
}

function drawEndpointName(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  otherX: number,
  otherY: number,
) {
  const dx = x - otherX;
  const dy = y - otherY;
  const len = Math.hypot(dx, dy) || 1;
  drawLabel(ctx, text, x + (dx / len) * 16 - 6, y + (dy / len) * 16);
}

function drawDimension(ctx: CanvasRenderingContext2D, entity: Entity) {
  ctx.strokeStyle = '#1a7a45';
  ctx.fillStyle = '#1a7a45';
  ctx.lineWidth = 1.5;

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

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  const metrics = ctx.measureText(text);
  const width = metrics.width + 10;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.strokeStyle = '#c5cdd6';
  ctx.fillRect(x - 5, y - 10, width, 20);
  ctx.strokeRect(x - 5, y - 10, width, 20);
  ctx.fillStyle = '#146b3a';
  ctx.fillText(text, x, y);
}

function onKeyDown(event: KeyboardEvent) {
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
    if (contextMenu.value) {
      closeContextMenu();
      return;
    }
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
  window.addEventListener('pointerdown', onDocumentPointerDown, true);

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
  window.removeEventListener('pointerdown', onDocumentPointerDown, true);
});
</script>

<style scoped>
.cad-shell {
  display: grid;
  grid-template-columns: 116px minmax(0, 1fr) 300px;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #e8ebf0;
}

.toolbar,
.panel {
  background: #ffffff;
  border-color: #d5dae2;
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
  color: #1a1f26;
}

.toolbar button,
.panel-switch button,
.entity-list button,
.constraint-tool,
.constraint-actions button,
.constraint-row button,
.danger {
  border: 1px solid #d5dae2;
  background: #f4f6f8;
  color: #2a313a;
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
  background: #111111;
}

.entity-list button.selected {
  border-color: #e7c84c;
  background: #fff6d6;
  color: #8a6d00;
}

.constraint-total {
  min-width: 24px;
  padding: 2px 8px;
  border: 1px solid #d5dae2;
  border-radius: 999px;
  color: #5c6673;
  font-size: 12px;
  text-align: center;
}

.constraint-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.constraint-tool {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: center;
  min-height: 38px;
  padding: 0 8px;
  text-align: left;
  cursor: pointer;
}

.constraint-tool.active {
  border-color: #1a7a45;
  background: #e5f6ec;
  color: #146b3a;
}

.constraint-icon {
  font-size: 17px;
  line-height: 1;
}

.constraint-editor {
  margin-bottom: 12px;
  padding: 10px;
  border: 1px solid #d5dae2;
  border-radius: 6px;
  background: #f7f8fa;
}

.constraint-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
}

.constraint-actions button {
  min-height: 34px;
  cursor: pointer;
}

.constraint-actions button:disabled {
  color: #8a93a0;
  cursor: default;
  opacity: 0.65;
}

.constraint-actions .ghost {
  background: #eef1f4;
}

.constraint-list {
  display: grid;
  gap: 8px;
}

.constraint-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 28px;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 7px;
  border: 1px solid #d5dae2;
  border-radius: 6px;
  background: #f7f8fa;
}

.constraint-badge {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #e5f6ec;
  color: #146b3a;
  font-size: 16px;
}

.constraint-row strong,
.constraint-row span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.constraint-row strong {
  color: #1a1f26;
  font-size: 13px;
}

.constraint-row span {
  color: #5c6673;
  font-size: 12px;
}

.constraint-row button {
  width: 28px;
  height: 28px;
  padding: 0;
  cursor: pointer;
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
  border-bottom: 1px solid #d5dae2;
  background: #f7f8fa;
  color: #5c6673;
  font-size: 13px;
}

.context-menu {
  position: fixed;
  z-index: 20;
  display: grid;
  min-width: 128px;
  padding: 6px;
  border: 1px solid #d5dae2;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 10px 28px rgba(17, 22, 28, 0.16);
}

.context-menu button {
  min-height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #1a1f26;
  text-align: left;
  cursor: pointer;
}

.context-menu button:hover {
  background: #f4f6f8;
}

.context-menu .danger-item {
  color: #9b1c2a;
}

.context-menu .danger-item:hover {
  background: #fdecee;
}

.selection-name {
  padding: 2px 8px;
  border: 1px solid #e7c84c;
  border-radius: 999px;
  background: #fff6d6;
  color: #8a6d00;
  font-weight: 700;
}

.history-actions {
  display: flex;
  gap: 6px;
  margin-left: auto;
}

.history-actions button {
  min-height: 26px;
  border: 1px solid #d5dae2;
  border-radius: 6px;
  background: #f4f6f8;
  color: #2a313a;
  cursor: pointer;
}

.history-actions button:disabled {
  color: #8a93a0;
  cursor: default;
  opacity: 0.65;
}

.stage {
  position: relative;
  min-width: 0;
  min-height: 0;
  background: #ffffff;
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
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border-width: 0 0 0 1px;
  overflow: hidden;
}

.panel-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid #d5dae2;
  background: #f7f8fa;
}

.panel-switch button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 36px;
  font-weight: 700;
}

.panel-switch button.active {
  border-color: #ffe66d;
  background: #f4d84f;
  color: #11161c;
}

.panel-switch span {
  min-width: 22px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(17, 22, 28, 0.08);
  font-size: 12px;
  line-height: 1.5;
}

.panel-switch button.active span {
  background: rgba(17, 22, 28, 0.16);
}

.panel-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 0;
  padding: 14px;
  overflow: auto;
}

h2 {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 700;
  color: #1a1f26;
}

.field {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
}

label {
  font-size: 12px;
  color: #5c6673;
}

input,
output,
select {
  width: 100%;
  min-height: 34px;
  border: 1px solid #d5dae2;
  border-radius: 6px;
  background: #ffffff;
  color: #1a1f26;
  padding: 6px 8px;
}

select {
  cursor: pointer;
}

.danger {
  width: 100%;
  min-height: 36px;
  margin-top: 4px;
  border-color: #e8b4b8;
  background: #fdecee;
  color: #9b1c2a;
}

.empty {
  margin: 0 0 12px;
  color: #5c6673;
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
  border: 1px solid #d5dae2;
  border-radius: 6px;
  background: #f4f6f8;
  color: #2a313a;
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
  border: 1px solid #d5dae2;
  border-radius: 6px;
  background: #f4f6f8;
  color: #2a313a;
  cursor: pointer;
}

.layer-row button.active {
  border-color: #e7c84c;
  color: #8a6d00;
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
