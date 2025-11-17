/**
 * Dependency Upgrade Verification Script
 *
 * This script verifies that the dependencies specified in RFC-0004 have been
 * successfully upgraded to the target versions.
 *
 * Usage:
 *   pnpm tsx scripts/verify-dependency-upgrades.ts
 *
 * Exit codes:
 *   0 - All dependencies are at the expected versions
 *   1 - One or more dependencies are not at the expected versions
 */

import { readFileSync } from 'fs';
import { join } from 'path';

interface VersionCheck {
  package: string;
  file: string;
  expected: string;
  description: string;
}

const ROOT_DIR = join(__dirname, '..');

const EXPECTED_VERSIONS: VersionCheck[] = [
  // Remix packages in webapp
  {
    package: '@remix-run/express',
    file: 'apps/webapp/package.json',
    expected: '2.14.0',
    description: 'Remix Express adapter',
  },
  {
    package: '@remix-run/node',
    file: 'apps/webapp/package.json',
    expected: '2.14.0',
    description: 'Remix Node runtime',
  },
  {
    package: '@remix-run/react',
    file: 'apps/webapp/package.json',
    expected: '2.14.0',
    description: 'Remix React integration',
  },
  {
    package: '@remix-run/serve',
    file: 'apps/webapp/package.json',
    expected: '2.14.0',
    description: 'Remix serve utility',
  },
  {
    package: '@remix-run/server-runtime',
    file: 'apps/webapp/package.json',
    expected: '2.14.0',
    description: 'Remix server runtime',
  },
  {
    package: '@remix-run/dev',
    file: 'apps/webapp/package.json',
    expected: '2.14.0',
    description: 'Remix dev tools',
  },
  {
    package: '@remix-run/testing',
    file: 'apps/webapp/package.json',
    expected: '^2.14.0',
    description: 'Remix testing utilities',
  },

  // graphile-worker
  {
    package: 'graphile-worker',
    file: 'apps/webapp/package.json',
    expected: '0.17.0',
    description: 'Job queue (webapp)',
  },
  {
    package: 'graphile-worker',
    file: 'internal-packages/zod-worker/package.json',
    expected: '0.17.0',
    description: 'Job queue (zod-worker)',
  },

  // OpenTelemetry packages (webapp)
  {
    package: '@opentelemetry/core',
    file: 'apps/webapp/package.json',
    expected: '2.1.0',
    description: 'OpenTelemetry core (webapp)',
  },
  {
    package: '@opentelemetry/resources',
    file: 'apps/webapp/package.json',
    expected: '2.1.0',
    description: 'OpenTelemetry resources (webapp)',
  },
  {
    package: '@opentelemetry/sdk-metrics',
    file: 'apps/webapp/package.json',
    expected: '2.1.0',
    description: 'OpenTelemetry SDK metrics (webapp)',
  },

  // OpenTelemetry packages (cli-v3)
  {
    package: '@opentelemetry/resources',
    file: 'packages/cli-v3/package.json',
    expected: '2.1.0',
    description: 'OpenTelemetry resources (cli-v3)',
  },
  {
    package: '@opentelemetry/sdk-trace-node',
    file: 'packages/cli-v3/package.json',
    expected: '2.1.0',
    description: 'OpenTelemetry SDK trace (cli-v3)',
  },

  // OpenTelemetry packages (core)
  {
    package: '@opentelemetry/core',
    file: 'packages/core/package.json',
    expected: '2.1.0',
    description: 'OpenTelemetry core (core package)',
  },
  {
    package: '@opentelemetry/resources',
    file: 'packages/core/package.json',
    expected: '2.1.0',
    description: 'OpenTelemetry resources (core package)',
  },
];

interface CheckResult {
  check: VersionCheck;
  actual: string | null;
  passed: boolean;
  error?: string;
}

function readPackageJson(filePath: string): any {
  try {
    const fullPath = join(ROOT_DIR, filePath);
    const content = readFileSync(fullPath, 'utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    throw new Error(`Failed to read ${filePath}: ${error.message}`);
  }
}

function getPackageVersion(packageJson: any, packageName: string): string | null {
  // Check dependencies
  if (packageJson.dependencies && packageJson.dependencies[packageName]) {
    return packageJson.dependencies[packageName];
  }

  // Check devDependencies
  if (packageJson.devDependencies && packageJson.devDependencies[packageName]) {
    return packageJson.devDependencies[packageName];
  }

  return null;
}

function versionsMatch(actual: string, expected: string): boolean {
  // Handle exact matches
  if (actual === expected) {
    return true;
  }

  // Handle caret versions (^2.14.0 should match ^2.14.0)
  if (actual.startsWith('^') && expected.startsWith('^')) {
    return actual === expected;
  }

  // Handle case where expected has caret but actual doesn't (or vice versa)
  const actualClean = actual.replace(/^[\^~]/, '');
  const expectedClean = expected.replace(/^[\^~]/, '');

  return actualClean === expectedClean;
}

function verifyDependency(check: VersionCheck): CheckResult {
  try {
    const packageJson = readPackageJson(check.file);
    const actualVersion = getPackageVersion(packageJson, check.package);

    if (actualVersion === null) {
      return {
        check,
        actual: null,
        passed: false,
        error: `Package "${check.package}" not found in ${check.file}`,
      };
    }

    const passed = versionsMatch(actualVersion, check.expected);

    return {
      check,
      actual: actualVersion,
      passed,
    };
  } catch (error: any) {
    return {
      check,
      actual: null,
      passed: false,
      error: error.message,
    };
  }
}

function main() {
  console.log('Verifying dependency upgrades from RFC-0004...\n');
  console.log('='.repeat(80));

  const results = EXPECTED_VERSIONS.map(verifyDependency);
  const failures = results.filter((r) => !r.passed);

  // Print results
  console.log('\nResults:\n');

  results.forEach((result) => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    const version = result.actual || 'NOT FOUND';
    const expected = result.check.expected;

    console.log(`${status} ${result.check.description}`);
    console.log(`  Package: ${result.check.package}`);
    console.log(`  File: ${result.check.file}`);
    console.log(`  Expected: ${expected}`);
    console.log(`  Actual: ${version}`);

    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }

    console.log();
  });

  console.log('='.repeat(80));
  console.log(`\nTotal checks: ${results.length}`);
  console.log(`Passed: ${results.length - failures.length}`);
  console.log(`Failed: ${failures.length}`);

  if (failures.length > 0) {
    console.log('\n❌ Some dependency versions do not match the expected values.');
    console.log('Please review the failures above and update the dependencies accordingly.\n');
    process.exit(1);
  } else {
    console.log('\n✅ All dependencies are at the expected versions!\n');
    process.exit(0);
  }
}

main();
