// 第 2 阶段 cypher-builder 练习脚本:图遍历
// 用法: node practice2.js
// 前置: 先跑 `node import.js` 确保数据已导入(15 节点 + 26 关系)

import { Match, NamedNode, Param, Pattern, NamedVariable, NamedPathVariable, labelExpr, length, ListComprehension, nodes as nodesFn } from '@neo4j/cypher-builder';
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

  // ---------- 示例 7:列表推导 + 5.21+ SHORTEST 语法 ----------
  // ⚠️ 之前注释说"cypher-builder 不支持列表推导"已过时 —— 3.3.0 已支持!

  // 7a:列表推导 - 从路径变量提取节点名字(用 cypher-builder 的 ListComprehension)
  // Cypher:
  //   MATCH p = (a:Person {name:'孙悟空'})-[*1..3]-(b:Person {name:'红孩儿'})
  //   RETURN [n IN nodes(p) | n.name] AS 经过的节点
  const a7 = new NamedNode('a7');
  const b7 = new NamedNode('b7');
  const p7 = new NamedPathVariable('p7');
  const n7 = new NamedVariable('n7');
  const pattern7 = new Pattern(a7, { labels: ['Person'], properties: { name: new Param('孙悟空') } })
    .related(null, { length: { min: 1, max: 3 }, direction: 'undirected' })
    .to(b7, { labels: ['Person'], properties: { name: new Param('红孩儿') } })
    .assignTo(p7);
  const listComp7 = new ListComprehension(n7)
    .in(nodesFn(p7))
    .map(n7.property('name'));
  const clause7a = new Match(pattern7).return([listComp7, '经过的节点']);
  await run('示例 7a:列表推导(cypher-builder 3.3.0 已支持)', clause7a);

  // 7b:5.21+ SHORTEST 新语法(cypher-builder 已支持)
  // Cypher: MATCH ALL SHORTEST (a:Person {name:'孙悟空'})-[*..5]-(b:Person {name:'红孩儿'})
  //         RETURN a.name, b.name
  // 注:5.21 之前的 shortestPath() / allShortestPaths() 函数式 API 仍需原生 Cypher
  const a7b = new NamedNode('a7b');
  const b7b = new NamedNode('b7b');
  const pattern7b = new Pattern(a7b, { labels: ['Person'], properties: { name: new Param('孙悟空') } })
    .related(null, { length: { min: 1, max: 5 }, direction: 'undirected' })
    .to(b7b, { labels: ['Person'], properties: { name: new Param('红孩儿') } });
  const clause7b = new Match(pattern7b).allShortest()
    .return(a7b.property('name'), b7b.property('name'));
  await run('示例 7b:ALL SHORTEST 新语法(Neo4j 5.21+)', clause7b);

  // 7c:老 shortestPath() 函数式 API 仍需原生 Cypher
  console.log('\n⚠️  老函数式 shortestPath() / allShortestPaths() 不在 cypher-builder API 中');
  console.log('   - 列表推导 ✅ 3.3.0 已支持(new ListComprehension)');
  console.log('   - 5.21+ SHORTEST 新语法 ✅ 已支持(Match.allShortest() / .shortest(k) / .any())');
  console.log('   - 老函数式 shortestPath() → 用原生 Cypher 字符串:');
  console.log('     MATCH p = shortestPath((a:Person {name:\'孙悟空\'})-[*..5]-(b:Person {name:\'红孩儿\'})) RETURN p;');
}

main()
  .catch((e) => {
    console.error('❌', e.message);
    process.exitCode = 1;
  })
  .finally(close);
