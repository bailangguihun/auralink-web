'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import dynamic from 'next/dynamic';
const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

// 解析 CSV
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  // 去除 UTF-8 BOM
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }

    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }

    if (char === '\r') {
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }

  // 尾行
  row.push(field);
  rows.push(row);

  // 去掉可能的空行
  const compact = rows.filter(r => r.some(c => String(c || '').trim() !== ''));
  if (compact.length === 0) return [];

  const header = compact[0];
  return compact.slice(1).map(cols => {
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = cols[idx] ?? '';
    });
    return obj;
  });
}

function normalizeString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function splitKeywords(text) {
  const s = normalizeString(text);
  if (!s) return [];
  return s
    .split(/[，,、；;\s\/\|·]+/)
    .map(t => t.trim())
    .filter(Boolean);
}

// 登录校验
function isTokenValid(token) {
  if (!token) return false;
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return false;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof window !== 'undefined' ?
      decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))
      : Buffer.from(base64, 'base64').toString('utf-8');
    const { exp } = JSON.parse(json);
    return exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

// 不确定/占位词清单，用于过滤
const UNKNOWN_TOKENS = ['未详','不详','未提供','未知','未注明','不确定','未明确提及','未提及','暂无','—','-','/','无','不明'];
function isUnknown(value) {
  const s = normalizeString(value);
  if (!s) return true;
  return UNKNOWN_TOKENS.some(t => s.includes(t));
}

function computeStats(records) {
  const safe = (r, k) => normalizeString(r[k]);

  // 概览
  const total = records.length;
  const dynastiesSet = new Set();
  const genresSet = new Set();
  const regionsSet = new Set();
  const authorsSet = new Set();

  records.forEach(r => {
    const dynasty = safe(r, '创作朝代');
    if (dynasty) dynastiesSet.add(dynasty);
    const genre = safe(r, '分类');
    if (genre) genresSet.add(genre);
    const birthplace = safe(r, '作者出生地');
    if (birthplace) regionsSet.add(birthplace);
    const author = safe(r, '作者姓名');
    if (author) authorsSet.add(author);
  });

  // 朝代统计
  const dynastyMapping = {
    '隋': ['隋', '隋代'],
    '唐代': ['唐', '唐代'],
    '五代十国': ['五代十国', '五代', '五代时期'],
    '宋代': ['宋', '宋代'],
    '元代': ['元', '元代'],
    '明代': ['明', '明代'],
    '清代': ['清', '清代'],
    '近现代': ['近现代', '近代', '民国', '民国时期', '现代', '当代', '当代艺术']
  };
  const dynastyCounts = {};
  records.forEach(r => {
    const dynasty = safe(r, '创作朝代');
    if (!dynasty || isUnknown(dynasty)) return;
    let matched = false;
    for (const [name, kws] of Object.entries(dynastyMapping)) {
      if (kws.some(k => dynasty.includes(k))) {
        dynastyCounts[name] = (dynastyCounts[name] || 0) + 1;
        matched = true;
        break;
      }
    }
    // 未匹配的朝代不计入
  });
  const dynastyOrderForStats = ['隋', '唐代', '五代十国', '宋代', '元代', '明代', '清代', '近现代'];
  const dynastyStats = Object.entries(dynastyCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => dynastyOrderForStats.indexOf(a.name) - dynastyOrderForStats.indexOf(b.name));

  // 创作热度
  const heatCounter = {};
  records.forEach(r => {
    const c = safe(r, '分类');
    if (c) heatCounter[c] = (heatCounter[c] || 0) + 1;
  });
  const heatStats = Object.entries(heatCounter)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // 词频：题材、画作流派、风格、色彩、构图、意境、笔法、墨法
  const wordFields = ['题材', '画作流派', '风格', '色彩', '构图', '意境', '笔法', '墨法'];
  const wordCounter = {};
  records.forEach(r => {
    wordFields.forEach(f => {
      if (isUnknown(r[f])) return;
      const tokens = splitKeywords(r[f]).filter(t => !UNKNOWN_TOKENS.includes(t));
      tokens.forEach(t => {
        if (t.length >= 1 && t.length <= 6) {
          wordCounter[t] = (wordCounter[t] || 0) + 1;
        }
      });
    });
  });
  const wordfreq = Object.entries(wordCounter)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 40);

  // 风格统计
  const styleCounter = {};
  records.forEach(r => {
    const styles = splitKeywords(r['风格']).filter(s => s && !UNKNOWN_TOKENS.includes(s));
    styles.forEach(s => { styleCounter[s] = (styleCounter[s] || 0) + 1; });
  });
  const styleStats = Object.entries(styleCounter)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);

  // 情感分布
  const emotionRules = {
    '宁静': ['宁静', '安详', '平和', '恬淡', '静谧', '祥和', '静', '冥想', '沉思', '恬静', '安谧', '安静', '寂静'],
    '淡雅': ['淡雅', '清雅', '淡', '雅', '清', '清幽', '清逸', '清秀', '清丽', '清淡', '素雅', '文雅'],
    '欢快': ['欢快', '愉悦', '喜', '乐', '明快', '明朗', '欢欣', '喜悦', '快乐', '欢', '活泼', '欢畅', '愉快', '高兴', '开心'],
    '激昂': ['雄浑', '壮阔', '豪放', '激昂', '磅礴', '雄伟', '豪迈', '壮烈', '雄', '壮', '豪', '激情', '雄壮', '豪情', '澎湃', '热烈'],
    '忧郁': ['忧郁', '哀愁', '悲凉', '凄美', '伤感', '忧愁', '哀', '愁', '悲', '凄', '哀伤', '悲怆', '凄婉', '悲伤', '难过'],
    '神秘': ['神秘', '幽深', '玄妙', '深邃', '奥妙', '玄', '深', '奥', '禅修', '玄奥', '幽玄', '奇幻', '迷离'],
    '优雅': ['优雅', '秀雅', '雅致', '文雅', '典雅', '优', '逸', '诗意', '温雅', '高贵', '端庄'],
    '豪放': ['豪放', '洒脱', '自由', '随意', '不拘', '豪爽', '奔放', '不羁'],
    '深沉': ['深沉', '凝重', '庄重', '肃穆', '沉郁', '厚重', '沉静', '稳重', '严肃'],
    '清新': ['清新', '清丽', '清秀', '清雅', '清逸', '清幽', '清爽', '清纯']
  };
  const emotionCounter = {};
  records.forEach(r => {
    if (isUnknown(r['音乐情境生成'])) return;
    const ctx = normalizeString(r['音乐情境生成']).toLowerCase();
    if (!ctx) return;
    const scores = {};
    for (const [emo, kws] of Object.entries(emotionRules)) {
      const m = kws.filter(k => ctx.includes(k.toLowerCase())).length;
      if (m > 0) scores[emo] = m;
    }
    if (Object.keys(scores).length > 0) {
      const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
      emotionCounter[best] = (emotionCounter[best] || 0) + 1;
    }
  });
  const emotionDist = Object.entries(emotionCounter)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // 情感曲线
  const emotionDict = {
    positive: { keywords: ['宁静', '淡雅', '清新', '欢快', '优雅', '祥和', '恬淡', '安详', '平和', '静谧', '诗意', '秀雅', '雅致', '文雅', '典雅'], weight: 1.0 },
    neutral: { keywords: ['自然', '朴实', '简约', '素雅', '清雅', '淡泊', '超脱', '空灵', '深远', '悠远'], weight: 0.5 },
    negative: { keywords: ['忧郁', '深沉', '苍凉', '悲凉', '萧瑟', '孤寂', '凄凉', '哀愁', '愁苦', '沉郁', '凝重', '压抑'], weight: -0.8 },
    excited: { keywords: ['激昂', '豪放', '雄浑', '壮阔', '磅礴', '雄伟', '豪迈', '奔放', '洒脱', '自由', '不拘', '豪情'], weight: 1.2 }
  };
  const dynastyOrderForCurve = ['隋', '唐代', '五代十国', '宋代', '元代', '明代', '清代', '近现代'];
  const dScore = {};
  records.forEach(r => {
    const dynasty = normalizeString(r['创作朝代']);
    const mood = normalizeString(r['意境']);
    if (!dynasty || !mood || isUnknown(dynasty) || isUnknown(mood)) return;
    let dName = '';
    for (const [name, kws] of Object.entries(dynastyMapping)) {
      if (kws.some(k => dynasty.includes(k))) { dName = name; break; }
    }
    if (!dName) return;
    let score = 50;
    const moodStr = mood.toLowerCase();
    Object.values(emotionDict).forEach(cfg => {
      const n = cfg.keywords.filter(k => moodStr.includes(k.toLowerCase())).length;
      if (n > 0) score += n * cfg.weight * 10;
    });
    const lengthBonus = Math.min(moodStr.length * 0.5, 15);
    score = Math.max(20, Math.min(100, score + lengthBonus));
    if (!dScore[dName]) dScore[dName] = { total: 0, count: 0 };
    dScore[dName].total += score;
    dScore[dName].count += 1;
  });
  const emotionCurve = Object.entries(dScore).map(([name, v]) => ({ name, value: Math.round(v.total / v.count) }));
  emotionCurve.sort((a, b) => dynastyOrderForCurve.indexOf(a.name) - dynastyOrderForCurve.indexOf(b.name));

  // 省份分布
  const provinceMapping = {
    '北京': ['北京', '京'],
    '天津': ['天津', '津'],
    '河北': ['河北', '石家庄', '唐山', '秦皇岛', '邯郸', '邢台', '保定', '张家口', '承德', '沧州', '廊坊', '衡水'],
    '山西': ['山西', '太原', '大同', '阳泉', '长治', '晋城', '朔州', '晋中', '运城', '忻州', '临汾', '吕梁'],
    '内蒙古': ['内蒙古', '呼和浩特', '包头', '乌海', '赤峰', '通辽', '鄂尔多斯', '呼伦贝尔', '巴彦淖尔', '乌兰察布', '兴安盟', '锡林郭勒盟', '阿拉善盟'],
    '辽宁': ['辽宁', '沈阳', '大连', '鞍山', '抚顺', '本溪', '丹东', '锦州', '营口', '阜新', '辽阳', '盘锦', '铁岭', '朝阳', '葫芦岛'],
    '吉林': ['吉林', '长春', '吉林市', '四平', '辽源', '通化', '白山', '松原', '白城', '延边'],
    '黑龙江': ['黑龙江', '哈尔滨', '齐齐哈尔', '鸡西', '鹤岗', '双鸭山', '大庆', '伊春', '佳木斯', '七台河', '牡丹江', '黑河', '绥化', '大兴安岭'],
    '上海': ['上海', '沪'],
    '江苏': ['江苏', '苏州', '南京', '无锡', '常州', '镇江', '扬州', '泰州', '南通', '盐城', '淮安', '连云港', '宿迁', '徐州'],
    '浙江': ['浙江', '杭州', '宁波', '温州', '嘉兴', '湖州', '绍兴', '金华', '衢州', '舟山', '台州', '丽水'],
    '安徽': ['安徽', '合肥', '芜湖', '蚌埠', '淮南', '马鞍山', '淮北', '铜陵', '安庆', '黄山', '滁州', '阜阳', '宿州', '六安', '亳州', '池州', '宣城'],
    '福建': ['福建', '福州', '厦门', '莆田', '三明', '泉州', '漳州', '南平', '龙岩', '宁德'],
    '江西': ['江西', '南昌', '景德镇', '萍乡', '九江', '新余', '鹰潭', '赣州', '吉安', '宜春', '抚州', '上饶'],
    '山东': ['山东', '济南', '青岛', '淄博', '枣庄', '东营', '烟台', '潍坊', '济宁', '泰安', '威海', '日照', '临沂', '德州', '聊城', '滨州', '菏泽'],
    '河南': ['河南', '郑州', '开封', '洛阳', '平顶山', '安阳', '鹤壁', '新乡', '焦作', '濮阳', '许昌', '漯河', '三门峡', '南阳', '商丘', '信阳', '周口', '驻马店'],
    '湖北': ['湖北', '武汉', '黄石', '十堰', '宜昌', '襄阳', '鄂州', '荆门', '孝感', '荆州', '黄冈', '咸宁', '随州'],
    '湖南': ['湖南', '长沙', '株洲', '湘潭', '衡阳', '邵阳', '岳阳', '常德', '张家界', '益阳', '郴州', '永州', '怀化', '娄底'],
    '广东': ['广东', '广州', '韶关', '深圳', '珠海', '汕头', '佛山', '江门', '湛江', '茂名', '肇庆', '惠州', '梅州', '汕尾', '河源', '阳江', '清远', '东莞', '中山', '潮州', '揭阳', '云浮'],
    '广西': ['广西', '南宁', '柳州', '桂林', '梧州', '北海', '防城港', '钦州', '贵港', '玉林', '百色', '贺州', '河池', '来宾', '崇左'],
    '海南': ['海南', '海口', '三亚', '三沙', '儋州'],
    '重庆': ['重庆', '渝'],
    '四川': ['四川', '成都', '自贡', '攀枝花', '泸州', '德阳', '绵阳', '广元', '遂宁', '内江', '乐山', '南充', '眉山', '宜宾', '广安', '达州', '雅安', '巴中', '资阳'],
    '贵州': ['贵州', '贵阳', '六盘水', '遵义', '安顺', '毕节', '铜仁', '黔西南', '黔东南', '黔南'],
    '云南': ['云南', '昆明', '曲靖', '玉溪', '保山', '昭通', '丽江', '普洱', '临沧', '楚雄', '红河', '文山', '西双版纳', '大理', '德宏', '怒江', '迪庆'],
    '西藏': ['西藏', '拉萨', '日喀则', '昌都', '林芝', '山南', '那曲', '阿里'],
    '陕西': ['陕西', '西安', '铜川', '宝鸡', '咸阳', '渭南', '延安', '汉中', '榆林', '安康', '商洛'],
    '甘肃': ['甘肃', '兰州', '嘉峪关', '金昌', '白银', '天水', '武威', '张掖', '平凉', '酒泉', '庆阳', '定西', '陇南', '临夏', '甘南'],
    '青海': ['青海', '西宁', '海东', '海北', '黄南', '海南', '果洛', '玉树', '海西'],
    '宁夏': ['宁夏', '银川', '石嘴山', '吴忠', '固原', '中卫'],
    '新疆': ['新疆', '乌鲁木齐', '克拉玛依', '吐鲁番', '哈密', '昌吉', '博尔塔拉', '巴音郭楞', '阿克苏', '克孜勒苏', '喀什', '和田', '伊犁', '塔城', '阿勒泰']
  };
  const municipalities = ['北京', '天津', '上海', '重庆'];
  const provinceCounter = {};
  const processedArtists = new Set();
  records.forEach(r => {
    const artist = normalizeString(r['作者姓名']);
    const birthplace = normalizeString(r['作者出生地']);
    if (!artist || !birthplace) return;
    const key = artist + '|' + birthplace;
    if (processedArtists.has(key)) return;
    processedArtists.add(key);
    for (const [p, cities] of Object.entries(provinceMapping)) {
      if (cities.some(c => birthplace.includes(c))) {
        provinceCounter[p] = (provinceCounter[p] || 0) + 1;
        return;
      }
    }
  });
  const provinceStats = Object.entries(provinceCounter)
    .map(([name, value]) => ({ name: municipalities.includes(name) ? name + '市' : name + '省', value }))
    .sort((a, b) => b.value - a.value);

  return {
    overview: {
      total,
      dynasties: dynastiesSet.size,
      genres: genresSet.size,
      regions: regionsSet.size,
      authors: authorsSet.size
    },
    dynastyStats,
    heatStats,
    wordfreq,
    emotionDist,
    emotionCurve,
    styleStats,
    provinceStats
  };
}

function useCharts(stats) {
  const common = {
    textStyle: { color: '#e5e7eb' },
    tooltip: { trigger: 'item' },
    grid: { left: 40, right: 20, top: 40, bottom: 40, containLabel: true }
  };

  const dynastyOption = useMemo(() => ({
    ...common,
    xAxis: { type: 'category', data: stats.dynastyStats.map(d => d.name), axisLabel: { rotate: 30, interval: 0, width: 90, overflow: 'truncate' } },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: stats.dynastyStats.map(d => d.value), itemStyle: { color: '#f59e0b' } }]
  }), [stats]);

  const heatOption = useMemo(() => ({
    ...common,
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: stats.heatStats.map(d => d.name), axisLabel: { interval: 0, width: 100, overflow: 'truncate' } },
    series: [{ type: 'bar', data: stats.heatStats.map(d => d.value), itemStyle: { color: '#a3e635' } }]
  }), [stats]);

  const wordfreqOption = useMemo(() => ({
    ...common,
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: stats.wordfreq.map(d => d.name).reverse() },
    series: [{ type: 'bar', data: stats.wordfreq.map(d => d.value).reverse(), itemStyle: { color: '#22d3ee' } }]
  }), [stats]);

  const emotionPie = useMemo(() => ({
    ...common,
    series: [{
      type: 'pie',
      radius: ['35%', '65%'],
      data: stats.emotionDist.map(d => ({ name: d.name, value: d.value })),
      label: { color: '#e5e7eb' }
    }]
  }), [stats]);

  const curveOption = useMemo(() => ({
    ...common,
    xAxis: { type: 'category', data: stats.emotionCurve.map(d => d.name) },
    yAxis: { type: 'value', min: 0, max: 100 },
    series: [{ type: 'line', data: stats.emotionCurve.map(d => d.value), smooth: true, areaStyle: {}, lineStyle: { color: '#f59e0b' } }]
  }), [stats]);

  const stylePie = useMemo(() => ({
    ...common,
    series: [{ type: 'pie', radius: ['35%', '65%'], data: stats.styleStats, label: { color: '#e5e7eb' } }]
  }), [stats]);

  const provinceBar = useMemo(() => ({
    ...common,
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: stats.provinceStats.map(d => d.name), axisLabel: { interval: 0, width: 100, overflow: 'truncate' } },
    series: [{ type: 'bar', data: stats.provinceStats.map(d => d.value), itemStyle: { color: '#60a5fa' } }]
  }), [stats]);

  return { dynastyOption, heatOption, wordfreqOption, emotionPie, curveOption, stylePie, provinceBar };
}

// 词云组件
function WordCloud({ items }) {
  if (!items || items.length === 0) return (
    <div className="text-gray-500 text-sm">暂无数据</div>
  );
  const max = Math.max(...items.map(i => i.value));
  const min = Math.min(...items.map(i => i.value));
  const scale = (v) => {
    if (max === min) return 18;
    const t = (v - min) / (max - min);
    return 14 + t * 28; // 14px ~ 42px
  };
  const hue = (v) => {
    if (max === min) return 45;
    const t = (v - min) / (max - min);
    return Math.round(35 + t * 40); // 金色系 35~75
  };

  const positions = items.map((w, i) => {
    const angle = ((i * 37) % 360) - 180; // 伪随机角
    const rot = [-45, -30, -15, 0, 15, 30, 45][(i * 7) % 7];
    const radius = 10 + (i * 9) % 40; // 百分比
    return { angle, rot, radius };
  });
  return (
    <div className="relative" style={{ height: 320 }}>
      {items.map((w, idx) => {
        const p = positions[idx];
        const cx = 50 + Math.cos((p.angle * Math.PI) / 180) * p.radius;
        const cy = 50 + Math.sin((p.angle * Math.PI) / 180) * p.radius;
        return (
          <span
            key={w.name + idx}
            className="absolute select-none"
            style={{
              left: `${cx}%`,
              top: `${cy}%`,
              transform: `translate(-50%, -50%) rotate(${p.rot}deg)` ,
              whiteSpace: 'nowrap',
              fontSize: scale(w.value),
              color: `hsl(${hue(w.value)} 80% 60%)`,
              textShadow: '0 0 6px rgba(255,255,255,0.15)'
            }}
            title={`${w.name}: ${w.value}`}
          >
            {w.name}
          </span>
        );
      })}
    </div>
  );
}

// SVG 地图着色组件
function SvgChoropleth({ provinceStats }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let mounted = true;
    const loadSvg = async () => {
      try {
        const res = await fetch('/map.svg');
        if (!res.ok) return;
        const text = await res.text();
        if (!mounted) return;

        const map = {};
        let max = 0, min = Infinity;
        provinceStats.forEach(p => {
          const key = p.name.replace(/省$/,'');
          map[key] = p.value;
          max = Math.max(max, p.value);
          min = Math.min(min, p.value);
        });
        if (!isFinite(min)) min = 0;

        const colorOf = (v) => {
          if (max === min) return '#1f2937';
          const t = (v - min) / (max - min);
          const a = 0.15 + t * 0.85;
          return `rgba(212, 175, 55, ${a})`;
        };

        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'image/svg+xml');
        const all = Array.from(doc.querySelectorAll('[id],[name],[data-name],[title]'));
        all.forEach(el => {
          const attrs = [
            el.getAttribute('data-name'),
            el.getAttribute('name'),
            el.getAttribute('id'),
            el.getAttribute('title')
          ].filter(Boolean);
          const label = attrs.join(' ');
          if (!label) return;
          for (const key of Object.keys(map)) {
            if (label.includes(key)) {
              el.setAttribute('fill', colorOf(map[key]));
              el.setAttribute('stroke', 'rgba(212,175,55,0.6)');
              el.setAttribute('stroke-width', '0.6');
              el.setAttribute('vector-effect', 'non-scaling-stroke');
              el.setAttribute('style', `${el.getAttribute('style') || ''}; transition: fill .2s ease;`);
              el.setAttribute('data-value', String(map[key]));
              break;
            }
          }
        });

        const serializer = new XMLSerializer();
        const out = serializer.serializeToString(doc.documentElement);
        setSvg(out);
      } catch (e) {
      }
    };
    loadSvg();
    return () => { mounted = false; };
  }, [provinceStats]);

  if (!svg) {
    return (
      <div className="text-gray-500 text-sm">地图加载中或不可用，将显示排行图</div>
    );
  }
  return (
    <div className="w-full overflow-hidden rounded-lg border border-amber-900/30 bg-black/30" style={{ minHeight: 500 }}>
      <div
        dangerouslySetInnerHTML={{ __html: svg }}
        style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}
      />
    </div>
  );
}

export default function PaintingAppreciationPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [records, setRecords] = useState([]);
  const [echartsCore, setEchartsCore] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const router = useRouter();

  // 路由守卫：未登录跳转登录页
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (!isTokenValid(token || '')) {
      router.push('/login');
    }
  }, [router]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch('/data/paintings.csv');
        if (!res.ok) throw new Error('无法加载 CSV 数据');
        const text = await res.text();
        const parsed = parseCSV(text);
        if (mounted) setRecords(parsed);
      } catch (err) {
        setError(err.message || '数据加载失败');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  const emptyStats = useMemo(() => ({
    overview: { total: 0, dynasties: 0, genres: 0, regions: 0 },
    dynastyStats: [],
    heatStats: [],
    wordfreq: [],
    emotionDist: [],
    emotionCurve: [],
    styleStats: [],
    provinceStats: []
  }), []);

  const stats = useMemo(() => (records.length ? computeStats(records) : emptyStats), [records, emptyStats]);
  const charts = useCharts(stats);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (typeof window === 'undefined') return;
      try {
        const e = await import('echarts');
        let chinaGeo = null;
        try {
          const resp = await fetch('/data/china.json');
          if (resp.ok) {
            chinaGeo = await resp.json();
          }
        } catch {}
        if (chinaGeo) {
          e.registerMap('china', chinaGeo);
        }
        try {
          await import('echarts-wordcloud');
        } catch {}
        if (mounted) {
          setEchartsCore(e);
          setMapReady(!!chinaGeo);
        }
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  // 地图配置
  const mapOption = useMemo(() => ({
    title: {
      text: '画家分布地图',
      left: 'center',
      top: 12,
      textStyle: { color: '#fbbf24', fontSize: 16, fontWeight: '600' }
    },
    tooltip: {
      trigger: 'item',
      formatter: (p) => `${p.name}: ${Number.isFinite(p.value) ? p.value : 0}`
    },
    visualMap: {
      min: 0,
      max: Math.max(1, Math.max(...stats.provinceStats.map(d => d.value), 1)),
      left: 10,
      bottom: 20,
      text: ['高','低'],
      inRange: { color: ['#1f2937', '#d4af37'] },
      textStyle: { color: '#e5e7eb' },
    },
    series: [{
      type: 'map',
      map: 'china',
      roam: true,
      label: { show: false },
      itemStyle: {
        areaColor: '#0b0b0d',
        borderColor: 'rgba(212,175,55,0.35)'
      },
      emphasis: { label: { show: false }, itemStyle: { areaColor: '#3b2f12' } },
      data: stats.provinceStats.map(d => ({ name: d.name, value: d.value }))
    }]
  }), [stats]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black relative overflow-hidden">
      <Navbar />
      <div className="container mx-auto pt-24 pb-16 px-6 relative z-10">
        <div className="mb-8 text-center">
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-amber-300 to-amber-600 bg-clip-text text-transparent">
            国画数据浏览
          </h1>
          <p className="text-gray-400 mt-2">基于真实数据的朝代、题材、情感与地域统计</p>
        </div>

        {loading && (
          <div className="text-gray-500 text-center">数据加载中...</div>
        )}
        {error && (
          <div className="text-red-400 text-center">{error}</div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="relative">
              <div className="absolute inset-0 -left-4 hidden lg:block" style={{ pointerEvents: 'none' }} />
              <div className="w-full" style={{ height: 'clamp(560px, 70vh, 820px)' }}>
                {echartsCore && mapReady && (
                  <ReactECharts
                    echarts={echartsCore}
                    option={mapOption}
                    notMerge={true}
                    lazyUpdate={true}
                    style={{ height: '100%' }}
                  />
                )}
                {echartsCore && !mapReady && (
                  <div className="h-full flex items-center justify-center text-gray-400">
                    地图资源加载失败，显示排行图
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6 overflow-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
              <div className="bg-black/40 backdrop-blur-md border border-amber-900/30 rounded-xl p-4">
                <h2 className="text-amber-400 font-semibold mb-3">数据概览</h2>
                <div className="text-gray-300 grid grid-cols-2 gap-2 text-sm">
                  <div>作品总数：{stats.overview.total}</div>
                  <div>画家总数：{stats.overview.authors}</div>
                </div>
              </div>
              <div className="bg-black/40 backdrop-blur-md border border-amber-900/30 rounded-xl p-4">
                <h2 className="text-amber-400 font-semibold mb-3">各朝代国画总数</h2>
                <ReactECharts option={charts.dynastyOption} style={{ height: 320 }} notMerge={true} lazyUpdate={true} />
              </div>
              <div className="bg-black/40 backdrop-blur-md border border-amber-900/30 rounded-xl p-4">
                <h2 className="text-amber-400 font-semibold mb-3">画作创作热度</h2>
                <ReactECharts option={charts.heatOption} style={{ height: 320 }} notMerge={true} lazyUpdate={true} />
              </div>
              <div className="bg-black/40 backdrop-blur-md border border-amber-900/30 rounded-xl p-4">
                <h2 className="text-amber-400 font-semibold mb-3">朝代情感曲线</h2>
                <ReactECharts option={charts.curveOption} style={{ height: 320 }} notMerge={true} lazyUpdate={true} />
              </div>
              <div className="bg-black/40 backdrop-blur-md border border-amber-900/30 rounded-xl p-4">
                <h2 className="text-amber-400 font-semibold mb-3">配乐情感分布</h2>
                <ReactECharts option={charts.emotionPie} style={{ height: 320 }} notMerge={true} lazyUpdate={true} />
              </div>
              <div className="bg-black/40 backdrop-blur-md border border-amber-900/30 rounded-xl p-4">
                <h2 className="text-amber-400 font-semibold mb-3">画作风格统计</h2>
                <ReactECharts option={charts.stylePie} style={{ height: 320 }} notMerge={true} lazyUpdate={true} />
              </div>
              <div className="bg-black/40 backdrop-blur-md border border-amber-900/30 rounded-xl p-4">
                <h2 className="text-amber-400 font-semibold mb-3">画作意象词云</h2>
                {echartsCore && (
                  <ReactECharts
                    echarts={echartsCore}
                    option={{
                      tooltip: {},
                      series: [{
                        type: 'wordCloud',
                        gridSize: 6,
                        sizeRange: [14, 48],
                        rotationRange: [-30, 30],
                        shape: 'circle',
                        textStyle: {
                          color: () => `hsl(${38 + Math.random()*32} 85% 58%)`,
                          fontWeight: '600'
                        },
                        emphasis: { textStyle: { shadowBlur: 8, shadowColor: 'rgba(255,255,255,.35)' } },
                        data: stats.wordfreq.map(w => ({ name: w.name, value: w.value }))
                      }]}}
                    notMerge={true}
                    lazyUpdate={true}
                    style={{ height: 360 }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

