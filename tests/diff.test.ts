import { describe, it, expect } from 'vitest';
import { diffTrees, treeFromFiles } from '../src/diff/diff';
import { VirtualTree, RepoTree } from '../src/diff/types';

describe('diffTrees', () => {
    it('should detect added files', () => {
        const local = treeFromFiles([
            { path: 'file1.js', content: 'new' }
        ]) as VirtualTree;
        const repo = treeFromFiles([]) as RepoTree;

        const result = diffTrees(local, repo);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            path: 'file1.js',
            status: 'added',
            newContent: 'new'
        });
    });

    it('should detect deleted files', () => {
        const local = treeFromFiles([]) as VirtualTree;
        const repo = treeFromFiles([
            { path: 'file1.js', content: 'old', sha: '123' }
        ]) as RepoTree;

        const result = diffTrees(local, repo);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            path: 'file1.js',
            status: 'deleted',
            oldContent: 'old',
            sha: '123'
        });
    });

    it('should detect modified files', () => {
        const local = treeFromFiles([
            { path: 'file1.js', content: 'new' }
        ]) as VirtualTree;
        const repo = treeFromFiles([
            { path: 'file1.js', content: 'old', sha: '123' }
        ]) as RepoTree;

        const result = diffTrees(local, repo);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            path: 'file1.js',
            status: 'modified',
            oldContent: 'old',
            newContent: 'new',
            sha: '123'
        });
    });

    it('should ignore unchanged files', () => {
        const local = treeFromFiles([
            { path: 'file1.js', content: 'same' }
        ]) as VirtualTree;
        const repo = treeFromFiles([
            { path: 'file1.js', content: 'same', sha: '123' }
        ]) as RepoTree;

        const result = diffTrees(local, repo);

        expect(result).toHaveLength(0);
    });

    it('should handle mixed changes and sort output', () => {
        const local = treeFromFiles([
            { path: 'c_mod.js', content: 'mod_new' },
            { path: 'a_add.js', content: 'new' },
            { path: 'd_same.js', content: 'same' }
        ]) as VirtualTree;

        const repo = treeFromFiles([
            { path: 'c_mod.js', content: 'mod_old', sha: '1' },
            { path: 'b_del.js', content: 'old', sha: '2' },
            { path: 'd_same.js', content: 'same', sha: '3' }
        ]) as RepoTree;

        const result = diffTrees(local, repo);

        // Expected order: a_add, b_del, c_mod
        expect(result).toHaveLength(3);

        expect(result[0].path).toBe('a_add.js');
        expect(result[0].status).toBe('added');

        expect(result[1].path).toBe('b_del.js');
        expect(result[1].status).toBe('deleted');

        expect(result[2].path).toBe('c_mod.js');
        expect(result[2].status).toBe('modified');
    });

    it('should handle empty trees', () => {
        const local = treeFromFiles([]) as VirtualTree;
        const repo = treeFromFiles([]) as RepoTree;
        expect(diffTrees(local, repo)).toEqual([]);
    });
});
