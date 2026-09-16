import neo4j from 'neo4j-driver';
import { Match, Node, Pattern, count } from '@neo4j/cypher-builder';

// ============ 配置(可用环境变量覆盖) ============
const URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const USER = process.env.NEO4J_USER || 'neo4j';
const PASSWORD = process.env.NEO4J_PASSWORD || 'your_password';

async function main() {
  // 1) 创建 driver 并验证连接
  const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
  await driver.verifyConnectivity();
  console.log('✅ Neo4j 连接成功');

  const session = driver.session();
  try {
    // 2) 探针:用 cypher-builder 构造 MATCH (n) RETURN count(n) 确认能正常查询
    const n = new Node();
    const countQuery = new Match(new Pattern(n)).return(count(n));
    const { cypher, params } = countQuery.build();
    const res = await session.run(cypher, params);

    const nodeCount = res.records[0].get('count(this0)').toNumber();
    console.log(`📊 当前数据库节点数:${nodeCount}`);

    // 调试:打印生成的 Cypher(方便对照学习)
    console.log('\n📋 生成的 Cypher 对照:');
    console.log('  计数:', cypher);
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((err) => {
  console.error('❌ 运行出错:', err.message);
  process.exitCode = 1;
});
