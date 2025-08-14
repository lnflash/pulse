#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Find all TypeScript files in src/modules
function findAllTsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip test directories and node_modules
      if (!file.includes('spec') && !file.includes('test') && file !== 'node_modules') {
        findAllTsFiles(filePath, fileList);
      }
    } else if (file.endsWith('.ts') && !file.endsWith('.spec.ts') && !file.endsWith('.test.ts')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

// Count lines of code
function countLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split('\n').length;
}

// Check if test file exists
function hasTestFile(filePath) {
  const testPath = filePath.replace('.ts', '.spec.ts');
  return fs.existsSync(testPath);
}

// Categorize modules by priority
function analyzeModules() {
  const srcPath = path.join(__dirname, '..', 'src', 'modules');
  const modules = {};
  
  // Get all module directories
  const modulesDirs = fs.readdirSync(srcPath).filter(dir => {
    const stat = fs.statSync(path.join(srcPath, dir));
    return stat.isDirectory();
  });
  
  modulesDirs.forEach(moduleName => {
    const modulePath = path.join(srcPath, moduleName);
    const files = findAllTsFiles(modulePath);
    
    const stats = {
      totalFiles: 0,
      totalLines: 0,
      filesWithTests: 0,
      filesWithoutTests: [],
      criticalFiles: []
    };
    
    files.forEach(file => {
      const relativePath = path.relative(srcPath, file);
      const lines = countLines(file);
      const hasTest = hasTestFile(file);
      
      stats.totalFiles++;
      stats.totalLines += lines;
      
      if (hasTest) {
        stats.filesWithTests++;
      } else {
        stats.filesWithoutTests.push({
          path: relativePath,
          lines: lines
        });
        
        // Mark critical files (services, controllers)
        if (file.includes('service') || file.includes('controller')) {
          stats.criticalFiles.push({
            path: relativePath,
            lines: lines,
            type: file.includes('service') ? 'service' : 'controller'
          });
        }
      }
    });
    
    stats.coverage = stats.totalFiles > 0 
      ? ((stats.filesWithTests / stats.totalFiles) * 100).toFixed(1)
      : 0;
    
    modules[moduleName] = stats;
  });
  
  return modules;
}

// Main analysis
console.log('\n📊 TEST COVERAGE ANALYSIS\n');
console.log('=' .repeat(80));

const modules = analyzeModules();

// Sort modules by lines of code without tests
const sortedModules = Object.entries(modules)
  .sort((a, b) => {
    const aUncovered = a[1].filesWithoutTests.reduce((sum, f) => sum + f.lines, 0);
    const bUncovered = b[1].filesWithoutTests.reduce((sum, f) => sum + f.lines, 0);
    return bUncovered - aUncovered;
  });

console.log('\n🎯 PRIORITY MODULES (by uncovered lines):\n');
sortedModules.slice(0, 10).forEach(([name, stats], index) => {
  const uncoveredLines = stats.filesWithoutTests.reduce((sum, f) => sum + f.lines, 0);
  console.log(`${index + 1}. ${name.padEnd(25)} - ${uncoveredLines} lines uncovered (${stats.coverage}% file coverage)`);
  
  if (stats.criticalFiles.length > 0) {
    console.log(`   ⚠️  Critical files without tests:`);
    stats.criticalFiles.forEach(file => {
      console.log(`      - ${file.path} (${file.lines} lines, ${file.type})`);
    });
  }
});

// Calculate overall stats
const totalStats = {
  totalModules: Object.keys(modules).length,
  totalFiles: 0,
  filesWithTests: 0,
  totalLines: 0,
  criticalFilesWithoutTests: 0
};

Object.values(modules).forEach(stats => {
  totalStats.totalFiles += stats.totalFiles;
  totalStats.filesWithTests += stats.filesWithTests;
  totalStats.totalLines += stats.totalLines;
  totalStats.criticalFilesWithoutTests += stats.criticalFiles.length;
});

console.log('\n📈 OVERALL STATISTICS:\n');
console.log(`Total modules: ${totalStats.totalModules}`);
console.log(`Total source files: ${totalStats.totalFiles}`);
console.log(`Files with tests: ${totalStats.filesWithTests} (${((totalStats.filesWithTests / totalStats.totalFiles) * 100).toFixed(1)}%)`);
console.log(`Total lines of code: ${totalStats.totalLines}`);
console.log(`Critical files without tests: ${totalStats.criticalFilesWithoutTests}`);

console.log('\n🎯 RECOMMENDED NEXT STEPS TO REACH 80% COVERAGE:\n');
console.log('1. Complete tests for remaining payment services:');
console.log('   - pending-payment.service.ts');
console.log('   - price.service.ts');
console.log('\n2. Add tests for critical WhatsApp services:');
console.log('   - whatsapp-web.service.ts (core messaging)');
console.log('   - conversation-manager.service.ts');
console.log('   - message.service.ts');
console.log('\n3. Add tests for authentication services:');
console.log('   - auth.service.ts');
console.log('   - webhook-auth.service.ts');
console.log('\n4. Add tests for notification services:');
console.log('   - notification.service.ts');
console.log('   - payment-notification.service.ts');

console.log('\n⏱️  ESTIMATED TIMELINE TO 80% COVERAGE:\n');
console.log('Week 1: Complete payment services & critical WhatsApp services');
console.log('Week 2: Authentication & notification services');
console.log('Week 3: Command handlers & remaining services');
console.log('Week 4: Integration tests & edge cases');
console.log('\n=' .repeat(80));