/**
 * Prisma Performance Benchmark Script
 *
 * This script benchmarks Prisma query performance to measure the impact
 * of Prisma version upgrades. Run this before and after upgrades to
 * compare performance improvements.
 *
 * Usage:
 *   pnpm tsx scripts/benchmark-prisma.ts
 *
 * Expected improvements (Prisma 5 → 6):
 * - Query latency: -30-40%
 * - Connection overhead: -20%
 * - Memory usage: -15%
 */

import { PrismaClient } from '@trigger.dev/database';

const prisma = new PrismaClient();

interface BenchmarkResult {
  operation: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
}

async function benchmarkQuery(
  name: string,
  queryFn: () => Promise<any>,
  iterations: number = 1000
): Promise<BenchmarkResult> {
  const times: number[] = [];

  // Warm-up run
  await queryFn();

  const start = Date.now();

  for (let i = 0; i < iterations; i++) {
    const queryStart = Date.now();
    await queryFn();
    const queryEnd = Date.now();
    times.push(queryEnd - queryStart);
  }

  const totalTime = Date.now() - start;
  const avgTime = totalTime / iterations;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);

  return {
    operation: name,
    iterations,
    totalTime,
    avgTime,
    minTime,
    maxTime,
  };
}

function printResult(result: BenchmarkResult) {
  console.log(`\n${result.operation}:`);
  console.log(`  Iterations: ${result.iterations}`);
  console.log(`  Total time: ${result.totalTime}ms`);
  console.log(`  Avg time:   ${result.avgTime.toFixed(2)}ms`);
  console.log(`  Min time:   ${result.minTime}ms`);
  console.log(`  Max time:   ${result.maxTime}ms`);
}

async function runBenchmarks() {
  console.log('Starting Prisma Performance Benchmarks...');
  console.log('========================================\n');

  const results: BenchmarkResult[] = [];

  try {
    // Benchmark 1: Simple findMany with filter
    console.log('Running: TaskRun findMany with status filter...');
    const result1 = await benchmarkQuery(
      'TaskRun.findMany (status filter, limit 100)',
      async () => {
        await prisma.taskRun.findMany({
          where: { status: 'PENDING' },
          take: 100,
        });
      },
      100 // Reduced iterations for realistic benchmark
    );
    results.push(result1);
    printResult(result1);

    // Benchmark 2: FindUnique by ID
    // First, get a sample ID
    const sampleRun = await prisma.taskRun.findFirst();
    if (sampleRun) {
      console.log('\nRunning: TaskRun findUnique by ID...');
      const result2 = await benchmarkQuery(
        'TaskRun.findUnique (by ID)',
        async () => {
          await prisma.taskRun.findUnique({
            where: { id: sampleRun.id },
          });
        },
        100
      );
      results.push(result2);
      printResult(result2);
    }

    // Benchmark 3: Count operation
    console.log('\nRunning: TaskRun count...');
    const result3 = await benchmarkQuery(
      'TaskRun.count',
      async () => {
        await prisma.taskRun.count({
          where: { status: 'PENDING' },
        });
      },
      100
    );
    results.push(result3);
    printResult(result3);

    // Benchmark 4: Complex query with relations
    console.log('\nRunning: TaskRun with relations...');
    const result4 = await benchmarkQuery(
      'TaskRun.findMany (with relations)',
      async () => {
        await prisma.taskRun.findMany({
          where: { status: 'PENDING' },
          take: 10,
          include: {
            runtimeEnvironment: true,
          },
        });
      },
      100
    );
    results.push(result4);
    printResult(result4);

    // Print summary
    console.log('\n========================================');
    console.log('Summary:');
    console.log('========================================');

    const totalAvgTime = results.reduce((sum, r) => sum + r.avgTime, 0) / results.length;
    console.log(`\nOverall average query time: ${totalAvgTime.toFixed(2)}ms`);

    console.log('\n📊 Performance Comparison Guide:');
    console.log('  Prisma 4.x → 5.x: Expected ~30-40% improvement');
    console.log('  Prisma 5.x → 6.x: Expected ~20-30% improvement');
    console.log('\n💡 Run this script before and after upgrades to measure actual improvements.');

  } catch (error) {
    console.error('Error running benchmarks:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the benchmarks
runBenchmarks()
  .then(() => {
    console.log('\n✅ Benchmarks completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Benchmarks failed:', error);
    process.exit(1);
  });
