/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { parseString } = require('xml2js');

// 源 GraphML 路径（复用 main2 的相对位置）
const sourceGraphml = path.join(__dirname, '..', '..', 'rag_storage', 'graph_chunk_entity_relation.graphml');

const outDir = path.join(__dirname, '..', 'public', 'data');
const outGraph = path.join(outDir, 'poetry-graph.json');
const outStats = path.join(outDir, 'poetry-stats.json');

if (!fs.existsSync(sourceGraphml)) {
  console.error('GraphML 源文件不存在：', sourceGraphml);
  process.exit(1);
}

const descriptionMapping = {
  honors: '纪念',
};

const entityTypeMapping = {
  category: '朝代/类别',
  event: '事件/诗词',
  person: '人物/诗人',
  location: '地点',
  geo: '地理',
  concept: '概念/意象',
  work: '作品',
  emotion: '情感',
  style: '风格',
  organization: '组织',
  object: '对象',
  literature: '文学',
  equipment: '设备',
  UNKNOWN: '未知',
};

const relationTypeMapping = {
  author: '作者关系',
  'cultural context': '文化背景',
  'historical influence': '历史影响',
  'literary contribution': '文学贡献',
  friendship: '友谊关系',
  'authorial connection': '作者关联',
  'life reflection': '人生反思',
  'historical context': '历史背景',
  'literary authorship': '文学创作',
  'literary creation': '文学创作',
  'existential reflection': '存在反思',
  'literary connection': '文学关联',
  'artistic expression': '艺术表达',
  'cultural symbolism': '文化象征',
  'emotional parallels': '情感共鸣',
  'literary relationship': '文学关系',
  admiration: '钦佩关系',
  commemoration: '纪念关系',
  'literary achievement': '文学成就',
  'artistic representation': '艺术表现',
  'nature imagery': '自然意象',
  'emotional resonance': '情感共鸣',
  'emotional expression': '情感表达',
  'poetic metaphor': '诗歌隐喻',
  'historical impact': '历史影响',
  mentorship: '师徒关系',
  emotion: '情感关系',
  'artistic interpretation': '艺术诠释',
  'art and literature': '艺术文学',
  'appreciation of nature': '自然欣赏',
  'artistic themes': '艺术主题',
  'nature vs conflict': '自然与冲突',
  art: '艺术关系',
  'artistic depiction': '艺术描绘',
  'art exhibition': '艺术展览',
  'art and poetry': '艺术诗歌',
  'cultural significance': '文化意义',
  'historical reflection': '历史反思',
  'cultural heritage': '文化遗产',
  nostalgia: '怀旧情感',
  imagery: '意象表达',
  'folk themes': '民间主题',
  mythology: '神话传说',
  'nature symbolism': '自然象征',
  'literary significance': '文学意义',
  'artistic influence': '艺术影响',
  'poetry appreciation': '诗歌欣赏',
  'musical tradition': '音乐传统',
  'rural childhood': '乡村童年',
  'cultural symbol': '文化符号',
  'life celebration': '生活庆典',
  'social gatherings': '社交聚会',
  'cultural importance': '文化重要性',
  'seasonal flower': '季节花卉',
  'seasonal change': '季节变化',
};

const parseXml = (xml) =>
  new Promise((resolve, reject) => {
    parseString(xml, (err, res) => (err ? reject(err) : resolve(res)));
  });

async function run() {
  const xml = fs.readFileSync(sourceGraphml, 'utf-8');
  const result = await parseXml(xml);
  const graph = result.graphml.graph[0];
  const nodes = graph.node || [];
  const edges = graph.edge || [];

  const entities = nodes.map((node) => {
    const data = node.data || [];
    const get = (k) => {
      const item = data.find((d) => d.$.key === k);
      return item ? item._ : '';
    };
    const originalType = get('d1');
    let desc = get('d2');
    Object.keys(descriptionMapping).forEach((en) => {
      if (desc.includes(en)) desc = desc.replace(en, descriptionMapping[en]);
    });
    return {
      id: node.$.id,
      entity_id: get('d0'),
      entity_type: entityTypeMapping[originalType] || originalType,
      description: desc,
      tooltip: desc,
    };
  });

  const relations = edges.map((edge) => {
    const data = edge.data || [];
    const get = (k) => {
      const item = data.find((d) => d.$.key === k);
      return item ? item._ : '';
    };
    let kw = get('d9');
    Object.keys(relationTypeMapping).forEach((en) => {
      if (kw.includes(en)) kw = kw.replace(en, relationTypeMapping[en]);
    });
    let desc = get('d8');
    Object.keys(descriptionMapping).forEach((en) => {
      if (desc.includes(en)) desc = desc.replace(en, descriptionMapping[en]);
    });
    return {
      source: edge.$.source,
      target: edge.$.target,
      value: parseFloat(get('d7')) || 1,
      label: kw,
      description: desc,
      summary: kw,
      detail: desc,
      tooltip: `${kw}\n${desc}`,
    };
  });

  // 统计
  const stats = {
    overview: {
      entities: entities.length,
      relations: relations.length,
      poems: entities.filter((e) => e.entity_type.includes('诗词')).length,
      poets: entities.filter((e) => e.entity_type.includes('诗人')).length,
    },
    entityTypeDistribution: [],
    relationTypeDistribution: [],
  };

  const typeCount = new Map();
  for (const e of entities) typeCount.set(e.entity_type, (typeCount.get(e.entity_type) || 0) + 1);
  stats.entityTypeDistribution = Array.from(typeCount.entries());

  const relTypeCount = new Map();
  for (const r of relations) {
    const first = (r.label || '其他').split(',')[0];
    relTypeCount.set(first, (relTypeCount.get(first) || 0) + 1);
  }
  stats.relationTypeDistribution = Array.from(relTypeCount.entries());

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    outGraph,
    JSON.stringify(
      {
        nodes: entities.map((e) => ({ id: e.id, name: e.entity_id, category: e.entity_type, size: 20, description: e.description, tooltip: e.tooltip })),
        links: relations.map((r) => ({ source: r.source, target: r.target, value: r.value, label: r.label, summary: r.summary, detail: r.detail })),
      },
      null,
      2
    )
  );
  fs.writeFileSync(outStats, JSON.stringify(stats, null, 2));
  console.log('写入完成：', outGraph, outStats);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
