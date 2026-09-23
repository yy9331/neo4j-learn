# Neo4j 学习路线图

基于西游记人物关系图(15 节点 + 26 关系)分阶段练习。每个知识点配一个可直接在 Browser 跑的查询和练习题。

> 学习数据由 [import.js](import.js) 一键导入(先清空再建,幂等)。练习前确保 Neo4j 已启动 + 数据已导入。

## 当前进度

| 阶段 | 状态 | 备注 |
|------|------|------|
| 第 1 阶段:Cypher 查询基础 | ✅ 已完成 | 见下方"第 1 阶段易错点" |
| 第 2 阶段:图遍历(核心) | ✅ 已完成 | 变长路径、最短路径、方向踩坑 |
| 第 3 阶段:写入与数据建模 | ✅ 已完成 | SET/REMOVE、多标签、MERGE、方向设计、建模思维 |
| 第 4 阶段:索引与性能 | ✅ 已完成 | 唯一约束/普通索引/EXPLAIN/PROFILE/DB hits/CartesianProduct 爆炸 |
| 第 5 阶段:高级 Cypher | ✅ 已完成 | CALL{} 新语法 CALL(p)、EXISTS 表达式、列表/模式推导、UNWIND/FOREACH、CASE WHEN、UNION |
| 第 6 阶段:生产实践 | ⏳ 选学 | driver 单例、APOC、GDS、备份 |

---

## 第 1 阶段:Cypher 查询基础 ✅

### 1.1 知识点清单

| 知识点 | 干什么 | 状态 |
|--------|--------|------|
| `MATCH` 多 pattern | 一次匹配多个节点模式 | ✅ |
| `WHERE` 过滤 | 条件筛选(=、IN、CONTAINS、正则) | ✅ |
| `RETURN` + 别名 | 结果重命名 | ✅ |
| `ORDER BY` + `LIMIT` | 排序分页 | ✅ |
| `DISTINCT` | 去重 | ✅ |
| 聚合 `count/collect` | 统计、收集 | ✅ |
| `WITH` 子句 | 流水线中间传递 | ✅ |

### 1.2 示例查询(直接跑)

```cypher
-- 1) 多 pattern
MATCH (a:Person {name:'唐僧'}), (b:Person {name:'如来佛祖'})
RETURN a.role AS 唐僧角色, b.role AS 如来角色;

-- 2) WHERE + IN + CONTAINS
MATCH (p:Person) WHERE p.role IN ['主角', '佛门'] RETURN p.name, p.role;
MATCH (p:Person) WHERE p.name CONTAINS '悟空' RETURN p.name;

-- 3) 别名 + 中文列名
MATCH (p:Person) RETURN p.name AS 姓名, p.role AS 角色;

-- 4) 排序分页
MATCH (p:Person) RETURN p.name ORDER BY p.name ASC SKIP 3 LIMIT 5;

-- 5) 去重 + 聚合
MATCH (p:Person) RETURN DISTINCT p.role;
MATCH (p:Person) RETURN p.role, count(p) AS 人数 ORDER BY 人数 DESC;

-- 6) collect 把多行聚成数组
MATCH (g:Person {name:'观音菩萨'})-[:度化]->(p)
RETURN collect(p.name) AS 度化名单;

-- 7) WITH 流水线(先聚合再过滤)
MATCH (p:Person)
WITH p.role AS r, count(p) AS n
WHERE n > 1
RETURN r, n;
```

### 1.3 对应的 cypher-builder 写法

> 项目惯例:动态/批量场景(导入、参数化查询)用 `@neo4j/cypher-builder` 构造,简单的只读查询直接写 Cypher 字符串更直观。下面把 1.2 的 7 个示例逐一改写成 cypher-builder,生成的 Cypher 会和 1.2 完全一致,可以对照学习。

**通用执行模板**(每个示例都遵循):

```js
import neo4j from 'neo4j-driver';
import { Match, Node, NamedNode, Param, Pattern, count, collect, and, or, eq, inOp, contains } from '@neo4j/cypher-builder';

const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'your_password'));
const session = driver.session();

// 构造 clause → build() 拿到 { cypher, params } → session.run
async function run(clause) {
  const { cypher, params } = clause.build();
  console.log('生成 Cypher:', cypher);
  return session.run(cypher, params);
}
```

#### 1) 多 pattern — 查唐僧 + 如来的 role

```cypher
MATCH (a:Person {name:'唐僧'}), (b:Person {name:'如来佛祖'})
RETURN a.role AS 唐僧角色, b.role AS 如来角色;
```

```js
const a = new NamedNode('a');
const b = new NamedNode('b');
const clause = new Match(
  new Pattern(a, { labels: ['Person'], properties: { name: new Param('唐僧') } })
).match(
  new Pattern(b, { labels: ['Person'], properties: { name: new Param('如来佛祖') } })
).return(
  [a.property('role'), '唐僧角色'],
  [b.property('role'), '如来角色'],
);
await run(clause);
```

> 💡 两个 API 坑:
> - Pattern 的 `properties` 值**必须用 `new Param(...)` 包装**,不能传裸字符串
> - 别名不用 `.as()`,而是用**二元数组** `[expr, '别名']`,多个字段用**多参数**(不是嵌套数组)


#### 2) WHERE + IN + CONTAINS

```cypher
MATCH (p:Person) WHERE p.role IN ['主角','佛门'] RETURN p.name, p.role;
MATCH (p:Person) WHERE p.name CONTAINS '悟空' RETURN p.name;
```

```js
import { Match, NamedNode, Param, Pattern, in as inOp, contains } from '@neo4j/cypher-builder';

const p = new NamedNode('p');

// WHERE p.role IN ['主角','佛门']
const clause1 = new Match(new Pattern(p, { labels: ['Person'] }))
  .where(inOp(p.property('role'), new Param(['主角', '佛门'])))
  .return(p.property('name'), p.property('role'));

// WHERE p.name CONTAINS '悟空'
const clause2 = new Match(new Pattern(p, { labels: ['Person'] }))
  .where(contains(p.property('name'), new Param('悟空')))
  .return(p.property('name'));
```

> 💡 关键点:
> - `in` 是 JS 保留字,cypher-builder 把 `inOp` 导出为 `in`,导入时必须 `import { in as inOp }`,然后用 `inOp(...)` 调用
> - 所有比较函数(`eq`/`neq`/`gt`/`lt`/`inOp`/`contains`/`matches`)签名都是 `(leftExpr, rightExpr)`,右边也必须是 Expr(`Param` / `Literal`),不能传裸字符串
> - 多个字段 return 用多参数:`.return(a, b)`,不要写成数组 `.return([a, b])`

#### 3) 别名 + 中文列名

```cypher
MATCH (p:Person) RETURN p.name AS 姓名, p.role AS 角色;
```

```js
const p3 = new NamedNode('p3');
const clause = new Match(new Pattern(p3, { labels: ['Person'] }))
  .return(
    [p3.property('name'), '姓名'],
    [p3.property('role'), '角色'],
  );
```

#### 4) 排序分页

```cypher
MATCH (p:Person) RETURN p.name ORDER BY p.name ASC SKIP 3 LIMIT 5;
```

```js
const p4 = new NamedNode('p4');
const clause = new Match(new Pattern(p4, { labels: ['Person'] }))
  .return(p4.property('name'))
  .orderBy([p4.property('name'), 'ASC'])
  .skip(3)
  .limit(5);
```

> 💡 `orderBy` 接受多参数,每个参数是 `[expr, 'ASC'|'DESC']` 或 `expr`(默认 ASC)。多字段排序:`.orderBy([a, 'DESC'], [b, 'ASC'])`。

#### 5) 去重 + 聚合

```cypher
MATCH (p:Person) RETURN DISTINCT p.role;
MATCH (p:Person) RETURN p.role, count(p) AS 人数 ORDER BY 人数 DESC;
```

```js
import { count } from '@neo4j/cypher-builder';

// DISTINCT
const p5 = new NamedNode('p5');
const clause1 = new Match(new Pattern(p5, { labels: ['Person'] }))
  .return(p5.property('role'))
  .distinct();

// count + 分组排序
const p5b = new NamedNode('p5b');
const nExpr = count(p5b);  // 复用同一个聚合表达式
const clause2 = new Match(new Pattern(p5b, { labels: ['Person'] }))
  .return(
    p5b.property('role'),
    [nExpr, '人数'],
  )
  .orderBy([nExpr, 'DESC']);
```

> 💡 把 `count(p)` 赋值到一个变量 `nExpr` 复用,既给 RETURN 用又给 ORDER BY 用,生成的 Cypher 里 `count(this0)` 会出现两次(Neo4j 会自动识别为同一个聚合)。不要用字符串别名在 `orderBy` 里排序,要传表达式本身。

#### 6) collect 把多行聚成数组

```cypher
MATCH (g:Person {name:'观音菩萨'})-[:度化]->(p)
RETURN collect(p.name) AS 度化名单;
```

```js
import { collect } from '@neo4j/cypher-builder';

const g = new NamedNode('g');
const p = new NamedNode('p');
const pattern = new Pattern(g, {
  labels: ['Person'],
  properties: { name: new Param('观音菩萨') },
})
  .related(null, { type: '度化' })  // 默认 direction: 'right'
  .to(p);

const clause = new Match(pattern).return(
  [collect(p.property('name')), '度化名单'],
);
```

> 💡 关系模式用 `new Pattern(nodeA).related(relVar, {type, direction}).to(nodeB)`。`relVar` 传 `null` 表示不命名关系变量,`direction` 默认 `right`,可选 `left` / `undirected`。

#### 7) WITH 流水线(先聚合再过滤)

```cypher
MATCH (p:Person)
WITH p.role AS r, count(p) AS n
WHERE n > 1
RETURN r, n;
```

```js
import { With, gt, count, NamedVariable } from '@neo4j/cypher-builder';

const p = new NamedNode('p');
const r = new NamedVariable('r');
const n = new NamedVariable('n');

const clause = new Match(new Pattern(p, { labels: ['Person'] }))
  .with(
    [p.property('role'), r],
    [count(p), n],
  )
  .where(gt(n, new Param(1)))
  .return(r, n);
```

> 💡 `WITH` 子句的 API 和 `RETURN` 几乎一样,`.with(...)` 接受多参数,每个是 `[expr, alias]`,alias 可以是字符串或 `Variable`。后续 `WHERE` 要引用 WITH 的别名,**必须用 `Variable` 作为 alias 而不是字符串**,否则在 cypher-builder 里没法引用到。
> 💡 比较运算符函数:`gt` (>), `gte` (>=), `lt` (<), `lte` (<=), `eq` (=), `neq` (<>),右边也必须是 `new Param(...)` 包装的 Expr。

### 1.3.1 什么时候用 cypher-builder,什么时候直接写 Cypher?

| 场景 | 推荐 |
|------|------|
| 动态构造(类型、属性来自变量) | cypher-builder |
| 批量导入(UNWIND + CREATE) | cypher-builder(见 import.js) |
| 参数化查询(用户输入) | cypher-builder(自动防注入) |
| 一次性只读查询、对数据非常熟悉 | 直接写 Cypher 字符串 |
| 复杂图遍历(shortestPath、变长路径) | 直接写 Cypher(cypher-builder 对这类支持不完整) |

**原则:** 越是动态、批量、对外暴露的查询,越值得用 cypher-builder;越是固定的一次性查询,直接写 Cypher 反而清晰。

### 1.4 易错点(本次练习踩过的坑)

#### ❌ 易错 1:`OR` vs `AND` 混淆

**题目:** 查出名字带"王"的凡人或妖魔。

**错误答案(并集):**

```cypher
MATCH (p:Person)
WHERE p.name =~ '.*王.*' OR p.role = '妖魔'
RETURN p;
```

错在:会返回所有妖魔(包括名字不带"王"的白骨精、红孩儿)。

**正确答案(交集):**

```cypher
MATCH (p:Person)
WHERE p.name =~ '.*王.*'
  AND p.role IN ['凡人', '妖魔']
RETURN p.name, p.role;
```

中文"凡人或妖魔"读起来像 OR,但意思其实是"凡人或妖魔之一",在 WHERE 里要用 `AND` 把"名字带王"和"角色属于这两个之一"连起来。

---

#### ❌ 易错 2:聚合函数没在 RETURN 里,却想在 ORDER BY 用

**错误答案:**

```cypher
MATCH (p:Person) RETURN p.role ORDER BY p.role DESC, count(p);
```

错在:`count(p)` 没出现在 RETURN 里,ORDER BY 引用不到。

**正确答案:**

```cypher
MATCH (p:Person)
RETURN p.role, count(p) AS 人数
ORDER BY 人数 DESC;
```

记住:**ORDER BY 引用的字段必须先在 RETURN 或 WITH 里出现过**。

---

#### ❌ 易错 3:同一条 MATCH 里起点终点用了相同变量名

**错误答案:**

```cypher
MATCH (g:Person {name:'观音菩萨'})-[:度化]->(p)
RETURN collect(p.name);
```

错在:起点和终点都用 `p`,Cypher 会把两者当成同一个节点,逻辑就乱了。

**正确答案(用不同变量名):**

```cypher
MATCH (g:Person {name:'观音菩萨'})-[:度化]->(p)
RETURN collect(p.name) AS 度化名单;
```

约定俗成:起点用语义化字母(`g` = Guanyin),终点用通用字母(`p` = Person)。

---

#### ❌ 易错 4:误以为 `MATCH ... AS` 能代替 `WITH`

**错误认知:**

```cypher
MATCH (s:Person {name:'孙悟空'}) AS s  -- ❌ 语法错误
```

**真相:**
- `AS` 只能在 `RETURN` 和 `WITH` 里给字段起别名
- `MATCH (s:Person {...})` 里的 `s` 已经是变量名了,不需要 AS
- `WITH` 的真正用途是**多步查询的中间传递**(投影、过滤、聚合),单步查询根本不用

---

#### ❌ 易错 5:`=~` 正则 vs `=` 等值的选型

**习惯性写法:** `p.role =~ '妖魔'` —— 能用但啰嗦。

**更优:** `p.role = '妖魔'` —— 等值匹配更直观,通常能走索引更快。

正则 `=~` 留给真正的模糊匹配(如 `.*王.*`、`^孙.*`)。

---

### 1.5 子句顺序速记

```
MATCH → WHERE → WITH → RETURN → ORDER BY → SKIP → LIMIT
```

和 SQL 一样,ORDER BY 在最后。

### 1.6 综合小作业

```cypher
-- 查"佛门"3 个人,按名字升序,中文列名
MATCH (p:Person)
WHERE p.role = '佛门'
RETURN p.name AS 姓名, p.description AS 简介
ORDER BY p.name ASC
LIMIT 3;
```

---

## 第 2 阶段:图遍历(核心!Neo4j 的灵魂) ✅

图数据库的价值全在这里。**关键概念:路径变量 `p`**,用 `MATCH p=()` 把整条链路(起点+关系+终点)一次性返回,Graph 视图能画出连线。

从路径里可提取:`nodes(p)` 节点列表、`relationships(p)` 关系列表、`length(p)` 跳数、`[n IN nodes(p) | n.name]` 列表推导映射。

### 2.1 知识点清单

| 知识点 | 干什么 | 状态 |
|--------|--------|------|
| 固定深度关系(1 跳/2 跳) | 查直接关系链 | ✅ |
| 变长路径 `*1..3` | 查 N 跳内关系链 | ✅ |
| 任意深度 `*` | 查所有可达节点 | ✅ |
| 最短路径 `shortestPath` | 两人间最短链 | ✅ |
| 所有最短路径 `allShortestPaths` | 所有等长最短链 | ✅ |
| 关系类型过滤 `[:A|B*]` | 只走指定类型 | ✅ |
| 无向遍历 `-[]-` | 不关心方向 | ✅ |
| 路径信息提取 | length/nodes/列表推导 | ✅ |

### 2.2 示例查询(直接跑)

```cypher
-- 1) 固定深度:观音度化的人,以及这些人降服的妖魔(2 跳)
MATCH p=(a:Person {name:'观音菩萨'})-[:度化]->(x)-[:降妖]->(y)
RETURN p;

-- 2) 变长路径:孙悟空 2 跳内能到达的所有节点
MATCH p=(a:Person {name:'孙悟空'})-[*1..2]->()
RETURN p;

-- 3) 任意深度:唐僧通过师徒关系链能传到谁
MATCH p=(a:Person {name:'唐僧'})-[:师徒*]-()
RETURN p;

-- 4) 最短路径:孙悟空到红孩儿
MATCH p = shortestPath((a:Person {name:'孙悟空'})-[*..5]-(b:Person {name:'红孩儿'}))
RETURN p;

-- 5) 所有最短路径:孙悟空到铁扇公主
MATCH p = allShortestPaths((a:Person {name:'孙悟空'})-[*..5]-(b:Person {name:'铁扇公主'}))
RETURN p;

-- 6) 关系类型过滤:唐僧通过师徒关系链传到谁(任意深度)
MATCH p=(a:Person {name:'唐僧'})-[:师徒*]-()
RETURN p;

-- 7) 无向遍历:红孩儿的所有家人
MATCH (s:Person {name:'红孩儿'})-[:父子|母子|夫妻]-(t)
RETURN t.name;

-- 8) 路径信息提取:孙悟空到红孩儿的最短路径详情
MATCH p = shortestPath((a:Person {name:'孙悟空'})-[*..5]-(b:Person {name:'红孩儿'}))
RETURN
  b.name AS 终点,
  length(p) AS 跳数,
  [n IN nodes(p) | n.name] AS 经过的节点
ORDER BY length(p) DESC;
```

### 2.3 变长路径语法速查

| 写法 | 含义 |
|------|------|
| `[*1..3]` | 1 到 3 跳 |
| `[*1..]` | 至少 1 跳,无上限 |
| `[*..3]` | 最多 3 跳(含 0 跳) |
| `[*2]` | 恰好 2 跳 |
| `[*]` | 任意长度(慎用,可能爆炸) |
| `[:师徒*]` | 只走师徒关系,任意深度 |
| `[:师徒\|师兄弟*]` | 走师徒或师兄弟,任意深度 |

### 2.4 最短路径要点

- `shortestPath(...)` 里**只能有 1 个 path**,起点终点都要明确
- **必须用无向 `-` 或 `-[]-`**,有向 `->` 可能因方向反了查不到
- 建议加跳数上限 `[*..5]`,防止路径过长

### 2.5 易错点(本次练习踩过的坑)

#### ❌ 易错 1:有向 vs 无向搞反,查不到数据

**场景:** 查孙悟空的师傅唐僧(数据库里是 `唐僧-[:师徒]->孙悟空`)。

**错误写法(方向反了):**

```cypher
MATCH (s:Person {name:'孙悟空'})-[:师徒]->(master)
RETURN master.name;  -- ❌ 查不到!师徒方向是 唐僧->悟空,从悟空出发往外走找不到
```

**正确写法(无向或显式反方向):**

```cypher
-- 无向,两个方向都查
MATCH (s:Person {name:'孙悟空'})-[:师徒]-(master)
RETURN master.name;  -- ✅ 能找到唐僧和徒弟们

-- 或者显式反方向
MATCH (s:Person {name:'孙悟空'})<-[:师徒]-(master)
RETURN master.name;  -- ✅ 只找到唐僧
```

**一句话:** 查关系前先想清楚数据方向是什么。不确定就用无向 `-[]-`。

---

#### ❌ 易错 2:shortestPath 里用有向箭头

**错误写法:**

```cypher
MATCH p = shortestPath((a:Person {name:'孙悟空'})-[:师徒*]->(b:Person {name:'唐僧'}))
RETURN p;  -- ❌ 可能查不到,因为方向可能反了
```

**正确写法(无向):**

```cypher
MATCH p = shortestPath((a:Person {name:'孙悟空'})-[*..5]-(b:Person {name:'唐僧'}))
RETURN p;  -- ✅ 不管方向都能找到
```

**一句话:** `shortestPath` / `allShortestPaths` 里统一用无向 `-`。

---

#### ❌ 易错 3:想让 Graph 视图显示连线,却只返回节点

**错误写法:**

```cypher
MATCH (a:Person)-[]->(b)
RETURN a;  -- ❌ 只返回节点,Graph 视图没有连线
```

**正确写法(返回路径或关系):**

```cypher
-- 返回路径(整条链路)
MATCH p=(a:Person)-[]->(b) RETURN p;

-- 或返回节点 + 关系 + 节点
MATCH (a:Person)-[r]->(b) RETURN a, r, b;
```

**一句话:** Graph 视图要有线,RETURN 里必须包含关系或路径。

---

## 第 3 阶段:写入与数据建模 ✅

> ⚠️ 本阶段会修改/删除数据,全部练习完后重跑 `node import.js` 恢复。

### 3.1 知识点清单

| 知识点 | 干什么 | 状态 |
|--------|--------|------|
| `SET` / `SET +=` | 修改/新增属性 | ✅ |
| `REMOVE` / `SET prop = NULL` | 删除属性 | ✅ |
| `SET :标签` / `REMOVE :标签` | 加/减标签 | ✅ |
| `DELETE` vs `DETACH DELETE` | 删节点(连关系一起删) | ✅ |
| `MERGE` + `ON CREATE SET` / `ON MATCH SET` | 幂等写入 | ✅ |
| 关系也能 SET 属性 | `SET r.rank = '大徒弟'` | ✅ |
| 关系方向设计 | 方向 = 最常用查询方向 | ✅ |
| 属性 vs 关系 | 不产生联系的做属性 | ✅ |
| 反范式取舍 | 冗余换性能,代价是一致性 | ✅ |

### 3.2 示例查询(直接跑)

```cypher
-- 1) SET 单个属性
MATCH (p:Person {name:'孙悟空'}) SET p.weapon = '金箍棒' RETURN p.name, p.weapon;

-- 2) SET += 合并 map
MATCH (p:Person {name:'沙悟净'}) SET p += {weapon: '降妖宝杖', origin: '流沙河'} RETURN p.name, p.weapon, p.origin;

-- 3) REMOVE / SET NULL(等价)
MATCH (p:Person {name:'沙悟净'}) REMOVE p.origin;
MATCH (p:Person {name:'沙悟净'}) SET p.origin = NULL;

-- 4) 加标签
MATCH (p:Person {name:'镇元子'}) SET p:Immortal RETURN labels(p) AS 标签;

-- 5) DELETE 有关系节点会报错
MATCH (p:Person {name:'红孩儿'}) DELETE p;  -- ❌ 报错
MATCH (p:Person {name:'红孩儿'}) DETACH DELETE p;  -- ✅ 连关系一起删

-- 6) MERGE + ON CREATE/ON MATCH
MERGE (p:Person {id:'erlang_shen', name:'杨戬'})
ON CREATE SET p.created = true, p.role = '天庭'
ON MATCH SET p.matched = true
RETURN p;
-- 第一次:created=true;第二次:matched=true(幂等)

-- 7) 关系 SET 属性
MATCH (t:Person {name:'唐僧'})-[r:师徒]->(s:Person {name:'孙悟空'})
SET r.rank = '大徒弟'
RETURN t.name, type(r) AS 关系, r.rank AS 排行, s.name;

-- 8) 方向思考:师徒是 唐僧->徒弟
MATCH (m)-[:师徒]->(t) WHERE m.name='唐僧' RETURN t.name;  -- 查徒弟
MATCH (m)<-[:师徒]-(t) WHERE m.name='唐僧' RETURN t.name;  -- 查师傅(空)
MATCH (m:Person) WHERE NOT (m)<-[:师徒]-() RETURN m.name;  -- 查没有师傅的人(唐僧)
```

### 3.3 建模三原则(必考)

| 问题 | 决策依据 | 结论 |
|------|---------|------|
| **关系方向** | 选最常用查询方向;双向常查用无向查询 | `师徒` 建 `唐僧->徒弟`,查徒弟快 |
| **属性 vs 节点** | 不产生联系的做属性;需要独立查询/有自己属性/多节点关联时升级为节点 | 金箍棒→属性;金箍棒曾被多人拿过→节点 |
| **范式 vs 反范式** | 读远多于写、性能瓶颈时反范式;代价是数据一致性要维护 | role 冗余到关系上→查询快,改 role 要改多处 |

### 3.4 易错点(本次练习踩过的坑)

1. **别名不能用字符串模板**:Cypher 的 AS 列名是静态标识符,不支持 `${p.name}标签列表` 这种动态插值,动态内容放值里
2. **DETACH DELETE 后 RETURN 节点为空**:节点已删,应该 `RETURN count(p)` 或 `RETURN p` 放在 DELETE 前面
3. **CREATE 重复执行会重复创建**:CREATE 无脑新建,要幂等用 MERGE + 唯一约束
4. **方向反了查不到**:数据方向是 `唐僧->徒弟`,反方向 `<-[:师徒]-` 查的是"谁是唐僧的师傅",空结果是正确的
5. **RETURN 关系对象 Table 视图隐藏属性**:Browser 默认只显示关系类型名,显式写 `r.rank` 或点 Raw 标签看完整属性

### 3.5 数据恢复

```bash
node import.js
```

---

## 第 4 阶段:索引与性能(项目变大后必学) ✅

> 本阶段全部只读查询,不修改数据,跑完后直接恢复(或不用恢复)。
>
> **核心工具:** `PROFILE` 和 `EXPLAIN` —— Neo4j 的"查询诊断显微镜"。

### 4.1 知识点清单

| 知识点 | 干什么 | 状态 |
|--------|--------|------|
| 唯一约束 | 防重复 + 自动索引 | ✅ |
| 普通索引 | 加速按属性查找 | ✅ |
| `EXPLAIN` | 看查询计划不执行 | ✅ |
| `PROFILE` | 执行 + 看 DB hits | ✅ |
| DB hits | 衡量查询工作量(磁盘访问次数) | ✅ |
| 执行计划树 | 自底向上执行的算子链 | ✅ |
| CartesianProduct 爆炸 | 多端点配对的性能杀手 | ✅ |
| 查询优化思路 | 先过滤再遍历、低基数陷阱、索引配对时机 | ✅ |

### 4.2 为什么需要索引?

现在只有 15 个节点,查询瞬间完成。但如果有 100 万个节点,每次 `MATCH (p:Person {name:'孙悟空'})` 都要**全表扫描**(遍历 100 万个节点找 name='孙悟空'),会很慢。

索引就是给常用查询字段**建一本书的目录**,让 Neo4j 直接定位而不是挨个翻。

### 4.3 约束 vs 索引:关系与区别

| 特性 | 唯一约束 (CONSTRAINT) | 普通索引 (INDEX) |
|------|----------------------|-----------------|
| 创建语句 | `CREATE CONSTRAINT person_id_unique FOR (p:Person) REQUIRE p.id IS UNIQUE` | `CREATE INDEX person_name FOR (p:Person) ON (p.name)` |
| 唯一性保证 | ✅ 强制,重复写入会报错 | ❌ 不保证 |
| 底层实现 | 就是一个唯一索引 | 普通 B+树索引 |
| 查询效率 | **完全相同**(底层都是索引查找) | 完全相同 |
| 命名 | 随便取,建议 `{label}_{property}_unique` | 随便取,建议 `{label}_{property}` |
| 是否自动清理 | 删约束时底层索引一起删 | 删索引直接删 |
| **推荐优先级** | **高!** 能加约束就不加普通索引 | 仅在不需要唯一性时用 |

> ⚠️ **重要:** 约束和索引是**两个独立的东西**,名字不同!删约束用 `DROP CONSTRAINT person_id_unique`,删索引用 `DROP INDEX person_name`。名字不能搞混。

### 4.4 PROFILE 执行计划树详解

PROFILE 的输出是一棵**自底向上执行**的树,每个算子是一层。用"无约束 role 查询"为例:

**查询:** `PROFILE MATCH (p:Person {role:'主角'}) RETURN p;`

```
        +ProduceResults     ← 第 1 层:结果出口(给用户返回数据)
           |
        +Filter             ← 第 2 层:过滤器(逐行检查 role='主角')
           |
        +NodeByLabelScan    ← 第 3 层:数据源头(扫所有 Person 节点)
```

**各算子含义:**

| 算子 | 干什么 | DB Hits 特点 |
|------|--------|-------------|
| **NodeByLabelScan** | 全表扫描,扫遍所有带某标签的节点 | = 节点数 + 1(标签索引查找) |
| **NodeIndexSeek** | 用普通 B+树索引定位节点 | = 索引树高度 + 桶扫描数 + 节点取数 |
| **NodeUniqueIndexSeek** | 用唯一索引定位节点(最多返回 1 条) | 最少,B+树一次命中 |
| **Filter** | 对上一层吐出来的行逐行过滤 | = 上一层 Rows × 每行属性读取 |
| **ProduceResults** | 把结果返回给用户 | = 返回行数 × 每行完整属性读取 |
| **CartesianProduct** | 把两个分支的结果做笛卡尔积 | 不直接读磁盘,但放大后续工作量(= 左 Rows × 右 Rows) |
| **ShortestPath** | 双向 BFS 最短路径算法 | = 遍历的关系数 + 邻居节点数,跳数越大越贵 |

### 4.5 练习题 & 对比数据

> 下面的数据都是在 15 节点 + 26 关系的测试集上实测的。数据量越小差距越不明显,数据量大(万级以上)时倍数会更大。

#### 练习 1:唯一约束 vs 无约束 — id 查询

**准备:** 先删约束 `DROP CONSTRAINT person_id_unique;`,跑 PROFILE,再重跑 `node import.js` 恢复约束,再跑 PROFILE。

**查询:** `PROFILE MATCH (p:Person {id:'tang_seng'}) RETURN p;`

| 指标 | 有唯一约束 `person_id_unique` | 无约束/索引 |
|------|------------------------------|------------|
| **执行计划** | `NodeUniqueIndexSeek` | `NodeByLabelScan` + `Filter` |
| Node 查找 DB Hits | **2**(B+树一次命中) | 16(扫 15 个节点) |
| Filter DB Hits | 无(索引已过滤) | 15(逐行比对 id) |
| **Total DB Hits** | **6** | **36** |
| 返回行数 | 1 | 1 |
| **差距** | — | **6 倍** |

**关键:** `NodeUniqueIndexSeek` 知道结果最多 1 条,直接 B+树定位,不需要 Filter。

---

#### 练习 2:普通索引 vs 无索引 — role 查询

**准备:** 先建索引 `CREATE INDEX person_role IF NOT EXISTS FOR (p:Person) ON (p.role);`,跑 PROFILE,再删索引 `DROP INDEX person_role;`,再跑 PROFILE。

**查询:** `PROFILE MATCH (p:Person {role:'主角'}) RETURN p;`

| 指标 | 有普通索引 `person_role` | 无索引 |
|------|------------------------|--------|
| **执行计划** | `NodeIndexSeek` (RANGE 模式) | `NodeByLabelScan` + `Filter` |
| 节点查找 DB Hits | **6** | 16 + 15 = 31 |
| **Total DB Hits** | **26** | **56** |
| 返回行数 | 5 | 5 |
| **差距** | — | **2 倍** |

**三方对比:**

| 查询类型 | 执行计划 | Total DB Hits | 原因 |
|---------|---------|---------------|------|
| id(唯一约束,高基数) | NodeUniqueIndexSeek | **6** | 唯一值,B+树精准定位 |
| role(普通索引,低基数) | NodeIndexSeek | **26** | 5 个值,索引桶里还要扫 5 个节点 |
| role(无索引) | NodeByLabelScan + Filter | **56** | 全扫 + 逐行过滤 |

> 💡 **低基数陷阱:** role 只有 5 个值,`{role:'主角'}` 走索引后仍然要扫 5 个节点 ID,再去取节点属性——和全表扫 15 个节点的差距只有 2 倍。如果 role 只有 2 个值,建索引甚至可能**比全表扫还慢**(索引查找开销 > 直接扫少量节点)。

---

#### 练习 3:shortestPath 端点索引 vs 无过滤

**查询 A(有端点过滤 + 索引):**
```cypher
PROFILE MATCH p = shortestPath(
  (a:Person {name:'唐僧'})-[*..5]-(b:Person {name:'如来佛祖'})
) RETURN p;
```

| 算子 | DB Hits | Rows | 说明 |
|------|---------|------|------|
| ProduceResults | 19 | 1 | 返回路径 |
| ShortestPath | 11 | 1 | 双向 BFS 跑 1 对节点 |
| CartesianProduct | 0 | 1 | 1×1 = 1 对 |
| NodeIndexSeek (找 a) | 2 | 1 | person_name 索引 |
| NodeIndexSeek (找 b) | 2 | 1 | person_name 索引 |
| **Total** | **34** | — | — |

**查询 B(无端点过滤,CartesianProduct 爆炸):**
```cypher
PROFILE MATCH p = shortestPath((a:Person)-[*..5]-(b:Person))
WHERE a <> b RETURN p;
```

| 算子 | DB Hits | Rows | 说明 |
|------|---------|------|------|
| ProduceResults | 3318 | 182 | 返回 182 条路径 |
| ShortestPath | 1538 | 182 | 210 对节点,每对跑 BFS |
| Filter | 0 | 210 | a <> b 过滤 |
| CartesianProduct | 0 | 225 | 15×15 = 225 对! |
| NodeByLabelScan (找 a) | 16 | 15 | 全扫 |
| NodeByLabelScan (找 b) | 240 | 225 | 全扫 × 15 次 |
| **Total** | **5112** | — | — |

**差距:34 → 5112,150 倍!** 💥

> 💡 **CartesianProduct 是性能杀手!** 两个分支各返回 N 行,CartesianProduct 就产生 N² 对,每对都要跑 shortestPath。**务必给 shortestPath 端点加精确属性过滤**,把 CartesianProduct 输入压到 1 对。

> ⚠️ **踩坑:** shortestPath 起点终点相同时会报错 "start and end nodes are the same",所以无过滤查询要加 `WHERE a <> b`,但这只是让它能跑起来,并没有解决 CartesianProduct 爆炸的根本问题。

---

#### 练习 4:`{name:'孙悟空'}` vs `WHERE p.name='孙悟空'` 谁更快?

**答案:** 写法 A(属性内嵌到 Pattern)更快。

| 写法 | Planner 优化时机 | 执行计划 |
|------|-----------------|---------|
| `MATCH (p:Person {name:'孙悟空'})` | **构建执行计划时**就绑定索引 | `NodeIndexSeek` 直接到位 |
| `MATCH (p:Person) WHERE p.name='孙悟空'` | 先规划全扫,再考虑用索引 | 可能 `NodeByLabelScan` + `Filter`(取决于 Planner 复杂度) |

**为什么叫"索引配对时机"?**
- 写法 A:Planner 在构建 Pattern 阶段就把 `name` 属性和索引**绑定**了,直接生成 `NodeIndexSeek`
- 写法 B:Planner 先规划 `NodeByLabelScan`,再规划 `Filter`,然后才想到"Filter 条件可以用索引"——这个优化是**后置**的,复杂查询里可能被跳过

> 💡 **实战建议:** 等值匹配条件优先写在 Pattern `{}` 里,WHERE 留给范围查询(`>`,`<`,`CONTAINS`,`IN` 等)。

---

#### 练习 5:role 索引在遍历查询中可能失效?

**查询:** `MATCH (p:Person {role:'主角'})-[:师徒]->(徒弟) RETURN 徒弟.name`

**现象:** role 索引只优化了"找起点 p"这一步(省了 ~25 hits),但真正贵的是"展开师徒关系"(扫关系表 + 读徒弟节点,几十上百 hits)——索引对此无能为力!

**核心认知:** 遍历查询的瓶颈在**路径展开**,不是起点定位。低基数字段索引(role 只有 5 个值)只省了几 hits,被遍历开销完全淹没。

> 💡 **遍历查询优化重点:** 关系类型过滤(`-[:师徒]-`) > 路径剪枝(`WHERE length(path) < 3`) > 给起点建高基数索引(name/id)。

### 4.6 EXPLAIN vs PROFILE

| | EXPLAIN | PROFILE |
|---|---------|---------|
| 执行查询 | ❌ 只生成计划,不执行 | ✅ 执行 + 收集统计 |
| DB hits 数值 | ❌ 没有 | ✅ 有 |
| 用途 | 看执行计划结构,确认会不会走索引、会不会有 CartesianProduct | 精确测量 DB hits,量化优化效果 |
| 适合场景 | 大查询不敢跑,先看计划对不对 | 对比优化前后的性能差距 |

### 4.7 索引创建/删除/查看

```cypher
-- ===== 创建 =====
CREATE CONSTRAINT person_id_unique IF NOT EXISTS
FOR (p:Person) REQUIRE p.id IS UNIQUE;

CREATE INDEX person_name IF NOT EXISTS
FOR (p:Person) ON (p.name);

-- ===== 查看 =====
SHOW INDEXES;      -- Neo4j 5.x 新语法
SHOW CONSTRAINTS;  -- Neo4j 5.x 新语法
-- ❌ CALL db.indexes() / CALL db.constraints() 是旧语法,5.x 已废弃

-- ===== 删除 =====
-- 注意:约束和索引名字不同!不能搞混!
DROP CONSTRAINT person_id_unique;
DROP INDEX person_name;

-- ===== 恢复(重跑 import.js)=====
node import.js
```

### 4.8 易错点

#### ❌ 易错 1:混淆约束名和索引名

- `person_id_unique` 是**约束**名,删约束用 `DROP CONSTRAINT person_id_unique`
- `person_name` 是**索引**名,删索引用 `DROP INDEX person_name`
- 不能写 `DROP INDEX person_id_unique` —— 会报 "No such index"

#### ❌ 易错 2:用 `CALL db.indexes()` 在 Neo4j 5.x

Neo4j 5.x 废弃了 `CALL db.indexes()` 和 `CALL db.constraints()`,改用 `SHOW INDEXES` 和 `SHOW CONSTRAINTS`。

#### ❌ 易错 3:shortestPath 起点终点相同导致报错

```cypher
-- ❌ 报错:"start and end nodes are the same"
MATCH p = shortestPath((a:Person)-[*..5]-(b:Person)) RETURN p;

-- ✅ 加 WHERE a <> b 排除自己到自己
MATCH p = shortestPath((a:Person)-[*..5]-(b:Person))
WHERE a <> b RETURN p;
```

但即使加了 `<> b`,CartesianProduct 还是会产生 15×14 = 210 对,每对都跑 shortestPath,DB hits 爆炸。**根本解法是给端点加精确属性过滤**。

#### ❌ 易错 4:以为 Neo4j 内部 `<id>` 可以做索引

Browser 里显示的 `<id>` 是 Neo4j 的**内部 ID**,是元数据不是属性,不能建索引。而且内部 ID 在节点删除后会复用、数据库重建后会变——**绝对不能用作业务标识**。必须自己定义 `id` 属性 + 唯一约束。

#### ❌ 易错 5:以为建了索引就万事大吉

- 低基数字段(role 只有 5 个值)建索引效果有限
- 遍历查询的瓶颈不在起点索引,而在路径展开
- `CONTAINS` / 正则 `/xxx/` 模糊匹配用不上普通 RANGE 索引(需要全文索引)
- 索引会增加写入开销(每次 INSERT/UPDATE 要维护 B+树)

### 4.9 核心收获

| # | 收获 | 一句话总结 |
|---|------|-----------|
| 1 | 唯一约束 = 防重复 + 自动索引,**查询效率和普通索引完全相同** | 能加约束就不加普通索引 |
| 2 | DB hits 是衡量查询性能的**最核心指标**,PROFILE 比 EXPLAIN 有用 | EXPLAIN 看结构,PROFILE 看成本 |
| 3 | CartesianProduct 是图查询的**性能杀手**,必须用精确过滤把输入压到最小 | shortestPath 端点一定要加属性约束 |
| 4 | `{prop: 'val'}` 比 `WHERE p.prop='val'` 快,因为索引配对时机更早 | 等值匹配写 Pattern 里,范围查询写 WHERE |
| 5 | 低基数字段索引收益有限,遍历查询瓶颈在路径展开而非起点定位 | 索引优先加高基数(id/name),遍历优化靠关系过滤和剪枝 |
| 6 | Neo4j 5.x 用 `SHOW INDEXES` / `SHOW CONSTRAINTS`,旧的 `CALL db.indexes()` 已废弃 | 升级版本要注意语法变化 |

---

## 第 5 阶段:高级 Cypher ✅

### 5.1 知识点清单

| 知识点 | 干什么 | 示例 |
|--------|--------|------|
| 子查询 `CALL {}` | 独立作用域的查询 | `MATCH (p:Person) CALL { MATCH (p:Person {name:'孙悟空'}) RETURN p.weapon AS w } RETURN w;` |
| `EXISTS` 子查询 | 检查模式是否存在 | `MATCH (p:Person) WHERE EXISTS((p)-[:度化]->()) RETURN p;` |
| 列表推导 | 集合操作 | `MATCH (a:Person {name:'孙悟空'})-[:师兄弟]-(b) RETURN [x IN collect(b.name) \| x];` |
| 模式推导 | 从路径提取属性 | `MATCH p=(a:Person {name:'唐僧'})-[*1..2]->(b) RETURN [x IN nodes(p) \| x.name];` |
| `UNWIND` | 列表展开成行(导入用) | import.js 已用 |
| `FOREACH` | 对每行执行操作 | `FOREACH (r IN [{name:'a'},{name:'b'}] \| CREATE (p:Person {name:r.name}));` |
| `CASE WHEN` | 条件表达式 | `MATCH (p:Person) RETURN p.name, CASE WHEN p.role='主角' THEN '团队' ELSE '其他' END AS 分组;` |
| `UNION` / `UNION ALL` | 合并结果集 | 两个 MATCH 的结果拼接 |

**学习目标:** 用子查询找出"被观音度化过且是妖魔的人",用列表推导把路径上所有名字拼成一个数组。

---

### 5.2 示例查询(8 个示例,逐一对应知识点)

> 全部 cypher-builder 对照写法见 [practice4.js](practice4.js)。下面只列 Cypher 原文 + 关键点。

#### 示例 1a:相关子查询 `CALL (p) {}` —— 每个主角被谁度化

```cypher
MATCH (p:Person {role: '主角'})
CALL (p) {                                  -- Neo4j 5.12+ 新语法
  MATCH (g:Person)-[:度化]->(p)              -- 用到了外层的 p,所以 CALL(p) 传变量
  RETURN g.name AS 度化者
}
RETURN p.name AS 姓名, collect(度化者) AS 被谁度化;
```

结果:5 行,每个主角的 `被谁度化` 都是 `["观音菩萨"]`。

#### 示例 1b:不相关子查询 `CALL () {}` —— 妖魔带主角总数

```cypher
MATCH (p:Person {role: '妖魔'})
CALL () {                                   -- 不传变量,空括号
  MATCH (a:Person {role: '主角'})
  RETURN count(a) AS 主角总数
}
RETURN p.name AS 姓名, 主角总数;              -- 不用 collect,子查询返回单标量
```

结果:4 行妖魔,每行 `主角总数 = 5`。

#### 示例 2:`EXISTS()` 检查关系方向 —— 谁度化过别人

```cypher
MATCH (p:Person)
WHERE EXISTS((p)-[:度化]->())               -- 函数式,推荐写法
RETURN p.name AS 度化者;
```

结果:1 行,观音菩萨。

**关键规则:** `EXISTS()` 的 pattern 里**不能引入新变量**(如 `(g:Person {name:'观音菩萨'})` 会报错),只能用外层变量或匿名 `()`。要过滤具体起点,用直接 MATCH 关系链代替 EXISTS。

#### 示例 3:列表推导 —— 奇数乘 10

```cypher
RETURN [x IN range(1, 10) WHERE x % 2 <> 0 | x * 10] AS 奇数乘十;
```

结果:`[10, 30, 50, 70, 90]`。

**语法:** `[变量 IN 列表 WHERE 谓词 | 映射表达式]`,WHERE 可选。管道符 `|` 不能漏。

#### 示例 3b:列表推导从节点列表提取属性

```cypher
MATCH (a:Person {name: '孙悟空'})-[:师兄弟]-(b)
WITH collect(b) AS brothers
RETURN [x IN brothers | x.name] AS 师兄弟名字;
```

结果:`["沙僧", "猪八戒"]`(顺序可能不同)。

#### 示例 4:模式推导 —— 观音度化的人名数组

```cypher
MATCH (a:Person {name: '观音菩萨'})
RETURN [(a)-[:度化]->(b) | b.name] AS 度化名单;
```

结果:5 个被度化者的名字。

**对比列表推导:** 模式推导的 `IN` 后面是图 pattern 而不是列表,适合"针对一个起点取邻居属性数组"。映射表达式只能是标量(如 `b.name`),不能是整个节点。

#### 示例 5:`UNWIND` + `MATCH` + `collect` —— 介绍数组

```cypher
UNWIND ['唐僧', '孙悟空', '猪八戒', '沙僧'] AS name
MATCH (p:Person {name: name})
RETURN collect(p.name + '-' + p.role) AS 介绍;
```

结果:1 行 `["唐僧-主角", "孙悟空-主角", "猪八戒-主角", "沙僧-主角"]`。

**关键:** UNWIND 本身**不丢 null**(null 元素会变成一行 null);后续 MATCH 匹配不到才会丢。`collect` 是 UNWIND 的逆运算,二者常配合使用。

#### 示例 6:`FOREACH` 批量 SET —— 给妖魔加 danger 属性

```cypher
-- ⚠️ 会修改数据,跑完重跑 node import.js 恢复
MATCH (p:Person {role: '妖魔'})
FOREACH (n IN [p] | SET n.danger = 'high')
RETURN p.name AS 姓名, p.danger;
```

结果:4 行,每个妖魔 `danger = 'high'`。

**关键:** `[p]` 是单元素列表(FOREACH 第一个参数必须是列表)。FOREACH 的 `|` 后只能写 `SET / CREATE / MERGE / DELETE`,不能写 `MATCH / RETURN / WHERE`。

#### 示例 7:`CASE WHEN` + `EXISTS` —— 度化身份分类

```cypher
MATCH (p:Person)
RETURN p.name AS 姓名,
       CASE
         WHEN EXISTS((p)-[:度化]->()) THEN '度化者'    -- 有度化出边
         WHEN EXISTS(()-[:度化]->(p)) THEN '被度化'    -- 有度化入边
         ELSE '无关'
       END AS 身份;
```

结果:15 行,观音 1 行(度化者)、5 主角(被度化)、9 其他(无关)。

**关键:** CASE 是**表达式**(必须返回值),不是语句(不能在里面写 MATCH)。EXISTS 是表达式,可以放 CASE WHEN 的条件里,不限于 WHERE 子句。

#### 示例 8a:`UNION` 去重合并 —— 观音度化 ∪ 悟空师兄弟

```cypher
MATCH (g:Person {name: '观音菩萨'})-[:度化]->(p)
RETURN p.name AS 姓名
UNION
MATCH (a:Person {name: '孙悟空'})-[:师兄弟]-(p)
RETURN p.name AS 姓名;
```

结果:**5 行**(5 被度化 ∪ 2 师兄弟 - 2 重复 = 5)。

#### 示例 8b:`UNION ALL` 保留重复 —— 对照行数

把上面 `UNION` 改为 `UNION ALL`,其他不变:

结果:**7 行**(5 + 2 = 7,猪八戒、沙僧各出现 2 次)。

**关键规则:** 子查询列数和列类型必须一致;列名以第一个查询为准。`UNION` 默认去重(Neo4j 5.19+ 可加 `DISTINCT` 显式),`UNION ALL` 保留所有重复。

---

### 5.3 语法速查

#### `CALL {}` 新旧语法对照(Neo4j 5.12+ 大改)

| 写法 | 状态 | 适用 |
|------|------|------|
| `CALL { WITH p MATCH ... }` | ⚠️ 已废弃,会有 deprecation warning | 旧代码 |
| `CALL { MATCH ... }`(裸) | ⚠️ 已废弃,要写 `CALL () { ... }` | 旧代码 |
| `CALL (p) { ... }` | ✅ 新语法,推荐 | 相关子查询(传变量) |
| `CALL () { ... }` | ✅ 新语法,推荐 | 不相关子查询(空括号) |
| `CALL (a, b) { ... }` | ✅ 传多个变量 | 多变量相关子查询 |
| `CALL (*) { ... }` | ✅ 传所有外层变量 | 简化相关子查询 |

#### `EXISTS` 的用法位置

| 位置 | 例子 |
|------|------|
| `WHERE` 过滤 | `WHERE EXISTS((p)-[:度化]->())` |
| `CASE WHEN` 条件 | `CASE WHEN EXISTS(...) THEN ... END` |
| `WITH` 过滤 | `WITH p WHERE EXISTS(...)` |

EXISTS 是**布尔表达式**,不限于 WHERE。pattern 里**不能引入新变量**,只能用外层变量或匿名 `()`。

#### 列表推导 vs 模式推导

| | 列表推导 | 模式推导 |
|--|---------|---------|
| 语法 | `[x IN list WHERE ... \| expr]` | `[(pattern) WHERE ... \| expr]` |
| `IN` 后面 | 列表(数组/`collect` 结果/`range`/`nodes`) | 图 pattern |
| 何时用 | 已有列表,要过滤+映射 | 从某起点取邻居属性数组 |
| 简写 | 可省 WHERE | 可省 WHERE |

#### `UNWIND` / `collect` / `FOREACH` 对比

| | 作用 | 输出 |
|--|------|------|
| `UNWIND list AS x` | 列表 → 多行 | 多行,每行一个元素 |
| `collect(x)` | 多行 → 列表 | 一个数组 |
| `FOREACH (x IN list \| 写操作)` | 对每个元素执行写操作 | 无输出(只改数据) |

#### `UNION` vs `UNION ALL`

| | `UNION` | `UNION ALL` |
|--|---------|-------------|
| 去重 | ✅ | ❌ |
| 性能 | 慢(要排序去重) | 快(直接拼) |
| 何时用 | 怕重复 | 确定无重复,或想要所有行 |

---

### 5.4 易错点(本次练习踩过的坑)

| # | 坑 | 表现 | 解决 |
|---|----|------|------|
| 1 | `CALL { WITH p ... }` 旧语法废弃 | Neo4j Browser 给 deprecation warning | 改用 `CALL (p) { ... }`(5.12+ 新语法) |
| 2 | 裸 `CALL {}` 也会废弃 | 同上 | 改用 `CALL () { ... }`(空括号) |
| 3 | 漏写 `WITH p` 导致变量 shadowing | 子查询里的 p 不是外层 p,匹配全表 | 用新语法 `CALL (p)` —— 作用域显式声明,不会再 shadow |
| 4 | `EXISTS()` 里写新变量 `(g:Person {...})` | 报错 `PatternExpressions are not allowed to introduce new variables` | 改用匿名 `()`,或改用直接 MATCH 关系链 |
| 5 | 误以为 `UNWIND` 会丢 null | 跑出来 null 元素还在 | UNWIND 不丢 null;后续 MATCH 匹配不到才会丢 |
| 6 | 不相关子查询用了 `collect` | 标量值被包成单元素数组 `[5]` 而不是 `5` | 子查询只返回一行标量时,外层直接引用,不用 collect |
| 7 | `EXISTS` 只能放 WHERE? | 之前以为是这样 | 错!EXISTS 是布尔表达式,CASE WHEN 条件、WITH 过滤都能用 |
| 8 | UNION 行数算错 | 把 5(去重)误算成 7 | UNION 去重:5 + 2 - 重复数(2)= 5;UNION ALL:5 + 2 = 7 |
| 9 | `FOREACH` 第一个参数忘了包列表 | 直接写 `FOREACH (n IN p \| ...)` 报错 | 必须是列表,单节点要包成 `[p]` |
| 10 | `FOREACH` 里写 `MATCH` | 报错 | FOREACH 只支持 `SET / CREATE / MERGE / DELETE`,要 MATCH 改用 UNWIND + SET |
| 11 | 模式推导想返回整个节点 | `[(a)-[:度化]->(b) \| b]` 报错 | 映射表达式只能是标量(如 `b.name`),不能是节点 |
| 12 | cypher-builder 的 `.return(expr, alias)` 误传两个参数 | 被当成两列分别 return | 别名要用二元组 `[expr, alias]` 形式 |

---

### 5.5 核心收获

- **CALL 子查询在 Neo4j 5.12+ 大改** —— `WITH p` 从子查询内部挪到了 `CALL` 括号上,新语法 `CALL (p) { ... }` 更安全(不会 shadowing)、更简洁。老语法虽然还能跑但已废弃,Browser 会提示
- **`EXISTS` 是表达式不是子句** —— 可以放 WHERE、CASE WHEN、WITH 过滤各种位置;pattern 里不能引入新变量,要过滤具体节点用直接 MATCH 关系链
- **列表推导 = Python list comprehension** —— `[x IN list WHERE 谓词 \| 映射]`,WHERE 可选,管道符 `|` 必填
- **模式推导是"针对当前节点的邻居数组速取器"** —— 不替代 MATCH;要遍历/聚合/路径变量时还得老老实实 MATCH
- **`UNWIND` 是 `collect` 的逆运算** —— 不丢 null,后续 MATCH 匹配不到才会丢;和 import.js 的批量导入是标准搭配
- **`FOREACH` 只能写,不能读** —— `|` 后只能 SET/CREATE/MERGE/DELETE,要 MATCH 改用 UNWIND + SET;第一个参数必须是列表(单节点包成 `[p]`)
- **`CASE WHEN` 是表达式** —— 必须返回值,不能在里面写 MATCH 等子句;没命中又没 ELSE 返回 null(不报错)
- **`UNION` 默认去重,`UNION ALL` 保留重复** —— 列数和类型必须一致,列名以第一个查询为准
- **cypher-builder 3.3.0 已支持列表/模式推导** —— 之前 practice2.js 注释说"不支持"已过时;但 EXISTS 块式语法和 CASE 嵌套复杂场景仍建议直接写原生 Cypher

---

## 第 6 阶段:生产实践(选学,看方向) ⏳

### 6.1 知识点清单

| 知识点 | 干什么 |
|--------|--------|
| 事务管理 | `session.beginTransaction()`、读写事务、回滚 |
| driver 调优 | `maxConnectionPoolSize`、`connectionAcquisitionTimeout` |
| APOC 库 | 数百个实用过程(数据转换、图操作、批处理) |
| GDS 库 | 图算法:PageRank、社区检测、相似度 |
| 备份恢复 | `neo4j-admin database dump`、`load` |
| 安全 | 角色权限、RBAC、加密 |
| 可视化 | `neovis.js`、`d3.js` 把图渲染到网页 |
| GraphQL | `@neo4j/graphql` 自动生成 API |
| 集群 | Causal Cluster、读副本、分片 |

---

## 推荐学习资源

| 资源 | 用途 |
|------|------|
| [Neo4j Cypher 官方手册](https://neo4j.com/docs/cypher-manual/current/) | 权威语法参考 |
| [Neo4j GraphAcademy](https://graphacademy.neo4j.com/) | 免费官方课程(含互动练习) |
| [Neo4j Sandbox](https://sandbox.neo4j.com/) | 免费云端实例,不用本地装 |
| 书籍《Neo4j 实战》 | 系统入门 |
| [APOC 文档](https://neo4j.com/docs/apoc/current/) | 实用过程库 |

---

## 学习进度跟踪

> 每次练习完一个阶段,把对应"状态"从 ⏳ 改为 ✅,并在该阶段下方补充踩过的坑。这样上下文清空后也能无缝续学。

### 第 1 阶段完成日期:2026-09-15

练习过的查询类型:多 pattern、WHERE、RETURN 别名、ORDER BY+LIMIT、DISTINCT、count/collect、WITH 子句。

踩过的坑:见上方 [1.4 易错点](#14-易错点本次练习踩过的坑)。

cypher-builder 对照写法:见 [1.3 对应的 cypher-builder 写法](#13-对应的-cypher-builder-写法),共 7 个示例逐一改写。

### 第 2 阶段完成日期:2026-09-18

练习过的查询类型:固定深度、变长路径 `*1..N`、任意深度 `*`、shortestPath、allShortestPaths、关系类型过滤、无向遍历、路径信息提取(length/nodes/列表推导)。

踩过的坑:见上方 [2.5 易错点](#25-易错点本次练习踩过的坑)。

核心收获:
- 图遍历关键是**路径变量 `p`**,`MATCH p=()` 把整条链路返回,Graph 视图才能画线
- **方向问题是图遍历头号陷阱**:数据方向 ↔ 查询方向,shortestPath 统一用无向
- Neo4j 图遍历性能远超传统 JOIN,但 `[*]` 任意深度要慎用

### 第 3 阶段完成日期:2026-09-21

练习过的查询类型:SET/SET +=、REMOVE、多标签、DELETE vs DETACH DELETE、MERGE + ON CREATE/ON MATCH、关系 SET 属性、方向设计、建模三原则(方向/属性vs节点/范式vs反范式)。

踩过的坑:见上方 [3.4 易错点](#34-易错点本次练习踩过的坑)。

核心收获:
- **写入和查询同等重要** — SET/REMOVE 是日常维护,不是一次性导入
- **建模决策影响查询效率** — 方向、属性vs节点、范式vs反范式三个问题要在设计阶段想清楚
- **MERGE 是生产级写入首选** — CREATE 重复会乱,MERGE 保证幂等,加唯一约束更稳
- **Browser 的 Table 视图会"简化显示"** — 关系对象默认只显示类型名,属性要显式返回或看 Raw 标签

### 第 4 阶段完成日期:2026-09-22

练习过的查询类型:唯一约束 vs 无约束 PROFILE 对比、普通索引 vs 无索引 PROFILE 对比、shortestPath 端点索引 vs 无过滤 CartesianProduct 爆炸、`{}` vs WHERE 索引配对时机对比、低基数陷阱与遍历查询瓶颈分析。

踩过的坑:见上方 [4.8 易错点](#48-易错点)。

核心收获:
- **唯一约束 = 防重复 + 自动索引**,查询效率和普通索引完全相同,能加约束就不加普通索引
- **DB hits 是衡量查询性能的最核心指标**,PROFILE 比 EXPLAIN 有用(EXPLAIN 看结构,PROFILE 看成本)
- **CartesianProduct 是图查询的性能杀手**:shortestPath 无端点过滤 → 34 hits → 5112 hits,**150 倍差距**!务必给端点加精确属性过滤
- **`{prop: 'val'}` 比 `WHERE p.prop='val'` 快**:索引配对时机更早,等值匹配写 Pattern 里
- **低基数字段(role 5 个值)索引收益有限**:role 索引省了 25 hits,但遍历开销淹没一切。遍历查询优化重点是关系过滤和路径剪枝,不是起点索引
- **Neo4j 5.x 语法变更**:`SHOW INDEXES` / `SHOW CONSTRAINTS` 替代旧的 `CALL db.indexes()` / `CALL db.constraints()`

量化数据汇总(15 节点测试集):

| 对比项 | 有约束/索引 | 无约束/索引 | 倍数 |
|--------|-----------|-----------|------|
| id 查询(唯一约束) | 6 hits | 36 hits | 6× |
| role 查询(普通索引) | 26 hits | 56 hits | 2× |
| shortestPath(端点索引) | 34 hits | 5112 hits | **150×** |

### 第 5 阶段完成日期:2026-09-23

练习过的查询类型:`CALL (p) {}` 相关子查询、`CALL () {}` 不相关子查询、`EXISTS()` 函数式检查、列表推导 `[x IN list WHERE ... | expr]`、模式推导 `[(pattern) | expr]`、`UNWIND` + `MATCH` + `collect`、`FOREACH` 批量 SET、`CASE WHEN` + `EXISTS` 分类、`UNION` / `UNION ALL` 行数对比。

踩过的坑:见上方 [5.4 易错点](#54-易错点本次练习踩过的坑),共 12 个。

核心收获:
- **CALL 子查询在 Neo4j 5.12+ 大改** —— 旧语法 `CALL { WITH p ... }` 已废弃,新语法 `CALL (p) { ... }` 把变量传移到 CALL 括号上,更安全(不会 shadowing)、更简洁;不传变量也要写空括号 `CALL () { ... }`
- **EXISTS 是表达式不是子句** —— 可以放 WHERE、CASE WHEN、WITH 过滤各种位置;pattern 里不能引入新变量(如 `(g:Person {name:'观音'})` 会报错),要过滤具体节点用直接 MATCH 关系链代替
- **列表推导 = Python list comprehension** —— `[x IN list WHERE 谓词 | 映射]`,管道符 `|` 必填;WHERE 可选
- **模式推导是"针对当前节点的邻居数组速取器"** —— 不替代 MATCH;要遍历/聚合/路径变量时还得老老实实 MATCH
- **UNWIND 不丢 null** —— null 元素会变成一行 null;后续 MATCH 匹配不到才会丢。`collect` 是 UNWIND 的逆运算,二者常配合使用
- **FOREACH 只能写不能读** —— `|` 后只能 SET/CREATE/MERGE/DELETE,要 MATCH 改用 UNWIND + SET;第一个参数必须是列表(单节点包成 `[p]`)
- **CASE WHEN 是表达式** —— 必须返回值,不能在里面写 MATCH 等子句;没命中又没 ELSE 返回 null(不报错)
- **UNION 默认去重,UNION ALL 保留重复** —— 列数和类型必须一致,列名以第一个查询为准
- **cypher-builder 3.3.0 已支持列表/模式推导** —— 之前 practice2.js 注释说"不支持"已过时;但 EXISTS 块式语法、CASE 嵌套 EXISTS、FOREACH+SET 等复杂场景仍建议直接写原生 Cypher
