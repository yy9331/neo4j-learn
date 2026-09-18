// 第 2 阶段 cypher-builder 练习脚本:图遍历
// 用法: node practice2.js
// 前置: 先跑 `node import.js` 确保数据已导入(15 节点 + 26 关系)

import { Match, NamedNode, Param, Pattern, NamedVariable, labelExpr, length } from '@neo4j/cypher-builder';
import { verify, run, close } from './neo4j-helper.js';

// ============ 主流程 ============
async function main() {
  await verify();

  // ---------- 示例 1:固定深度(2 跳) ----------
  const a1 = new NamedNode('a1');
  const x1 = new NamedNode('x1');
  const y1 = new NamedNode('y1');
  const p1 = new NamedVariable('p1');
  const pattern1 = new Pattern(a1, { labels: ['Person'], properties: { name: new Param('观音菩萨') } })
    .related(null, { type: '度化' }).to(x1)
    .related(null, { type: '降妖' }).to(y1)
    .assignTo(p1);
  await run('示例 1:固定深度 2 跳(观音→度化→降妖→妖魔)', new Match(pattern1).return(p1));

  // ---------- 示例 2:变长路径 *1..2 ----------
  const a2 = new NamedNode('a2');
  const b2 = new NamedNode('b2');
  const p2 = new NamedVariable('p2');
  const pattern2 = new Pattern(a2, { labels: ['Person'], properties: { name: new Param('孙悟空') } })
    .related(null, { length: { min: 1, max: 2 } }).to(b2)
    .assignTo(p2);
  await run('示例 2:变长路径 *1..2(孙悟空 2 跳可达)', new Match(pattern2).return(p2));

  // ---------- 示例 3:任意深度 * + 关系类型过滤 ----------
  const a3 = new NamedNode('a3');
  const b3 = new NamedNode('b3');
  const p3 = new NamedVariable('p3');
  const pattern3 = new Pattern(a3, { labels: ['Person'], properties: { name: new Param('唐僧') } })
    .related(null, { type: '师徒', length: '*', direction: 'undirected' }).to(b3)
    .assignTo(p3);
  await run('示例 3:任意深度 [:师徒*] 无向(唐僧师徒链)', new Match(pattern3).return(p3));

  // ---------- 示例 4:多关系类型 OR [:师徒|师兄弟*] ----------
  const a4 = new NamedNode('a4');
  const b4 = new NamedNode('b4');
  const p4 = new NamedVariable('p4');
  const pattern4 = new Pattern(a4, { labels: ['Person'], properties: { name: new Param('孙悟空') } })
    .related(null, { type: labelExpr.or('师徒', '师兄弟'), length: '*', direction: 'undirected' }).to(b4)
    .assignTo(p4);
  await run('示例 4:[:师徒|师兄弟*] 无向(孙悟空师门关系)', new Match(pattern4).return(p4));

  // ---------- 示例 5:无向遍历 ----------
  const s5 = new NamedNode('s5');
  const t5 = new NamedNode('t5');
  const pattern5 = new Pattern(s5, { labels: ['Person'], properties: { name: new Param('红孩儿') } })
    .related(null, { type: labelExpr.or('父子', '母子', '夫妻'), direction: 'undirected' }).to(t5);
  await run('示例 5:无向遍历(红孩儿的家人)', new Match(pattern5).return(t5.property('name')));

  // ---------- 示例 6:路径信息提取 length() + ORDER BY ----------
  const a6 = new NamedNode('a6');
  const b6 = new NamedNode('b6');
  const p6 = new NamedVariable('p6');
  const lenExpr = length(p6);
  const pattern6 = new Pattern(a6, { labels: ['Person'], properties: { name: new Param('唐僧') } })
    .related(null, { length: { min: 1, max: 3 } }).to(b6)
    .assignTo(p6);
  const clause6 = new Match(pattern6)
    .return(
      [b6.property('name'), '终点'],
      [lenExpr, '跳数'],
    )
    .orderBy([lenExpr, 'DESC']);
  await run('示例 6:路径信息提取 + ORDER BY length DESC', clause6);

  // ---------- 示例 7:⚠️ shortestPath / 列表推导不支持 ----------
  console.log('\n⚠️  shortestPath / allShortestPaths / 列表推导');
  console.log('   cypher-builder 不直接支持这些语法,建议直接写 Cypher 字符串:');
  console.log(`
  // shortestPath
  MATCH p = shortestPath((a:Person {name:'孙悟空'})-[*..5]-(b:Person {name:'红孩儿'}))
  RETURN p;

  // allShortestPaths
  MATCH p = allShortestPaths((a:Person {name:'孙悟空'})-[*..5]-(b:Person {name:'铁扇公主'}))
  RETURN p;

  // 列表推导
  MATCH p = shortestPath((a:Person {name:'孙悟空'})-[*..5]-(b:Person {name:'红孩儿'}))
  RETURN [n IN nodes(p) | n.name] AS 经过的节点;
  `);
}

main()
  .catch((e) => {
    console.error('❌', e.message);
    process.exitCode = 1;
  })
  .finally(close);
