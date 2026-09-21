'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadarChart } from '@/components/ui/chart';
import { api } from '@/lib/api';
import { Target, TrendingUp, AlertTriangle, Brain, Filter } from 'lucide-react';

interface SkillNode {
  id: string;
  name: string;
  parentId: string | null;
  category: string;
  proficiency: number | null;
  confidence: string;
  evidenceCount: number;
}

export default function SkillsPage() {
  const [skillGraph, setSkillGraph] = useState<SkillNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | 'all'>('all');

  useEffect(() => {
    fetchSkills();
  }, []);

  async function fetchSkills() {
    try {
      setLoading(true);
      const res = await api.get<{ skillGraph: SkillNode[] }>('/intelligence/skills');
      setSkillGraph(res.skillGraph);
    } catch (error) {
      console.error('Failed to fetch skills', error);
    } finally {
      setLoading(false);
    }
  }

  const categories = ['all', ...Array.from(new Set(skillGraph.map(s => s.category)))];

  const roots = skillGraph.filter(s => !s.parentId && (activeCategory === 'all' || s.category === activeCategory));
  const childrenMap = new Map<string, SkillNode[]>();
  skillGraph.forEach(s => {
    if (s.parentId) {
      const arr = childrenMap.get(s.parentId) || [];
      arr.push(s);
      childrenMap.set(s.parentId, arr);
    }
  });

  const categorySkills = skillGraph.filter(s => !s.parentId && s.proficiency !== null);
  const radarData = categorySkills.map(s => ({
    subject: s.name,
    score: s.proficiency || 0,
    fullMark: 100,
  }));

  const getConfidenceColor = (conf: string) => {
    switch (conf) {
      case 'HIGH': return 'text-green-600 bg-green-50 border-green-200';
      case 'MEDIUM': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'LOW': return 'text-orange-600 bg-orange-50 border-orange-200';
      default: return 'text-muted-foreground bg-muted border-border';
    }
  };

  const getConfidenceIcon = (conf: string) => {
    switch (conf) {
      case 'HIGH': return <TrendingUp className="h-3 w-3" />;
      case 'MEDIUM': return <Target className="h-3 w-3" />;
      case 'LOW': return <AlertTriangle className="h-3 w-3" />;
      default: return <Brain className="h-3 w-3" />;
    }
  };

  const renderNode = (skill: SkillNode, depth: number = 0) => {
    const children = childrenMap.get(skill.id) || [];
    const hasChildren = children.length > 0;

    return (
      <div key={skill.id} className="space-y-1" style={{ paddingLeft: `${depth * 1.5}rem` }}>
        <div className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/30 transition-colors">
          <div className="flex-1 flex items-center gap-3 min-w-0">
            {hasChildren && (
              <span className="text-muted-foreground">▼</span>
            )}
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{skill.name}</span>
              <Badge variant="outline" className="text-xs">{skill.category}</Badge>
            </div>
            {skill.proficiency !== null && (
              <>
                <Progress value={skill.proficiency} className="w-32 h-1.5" />
                <span className="text-sm font-mono w-10 text-right" style={{ color: `hsl(${120 - skill.proficiency * 1.2}, 70%, 40%)` }}>
                  {skill.proficiency}%
                </span>
              </>
            )}
            {skill.proficiency === null && (
              <Badge variant="outline" className="text-xs">No data</Badge>
            )}
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${getConfidenceColor(skill.confidence)}`}>
              {getConfidenceIcon(skill.confidence)}
              <span>{skill.confidence}</span>
              <span className="text-muted-foreground">({skill.evidenceCount})</span>
            </div>
          </div>
        </div>
        {children.map(child => renderNode(child, depth + 1))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-1/4 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
        <div className="h-96 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Skill Graph</h1>
          <p className="text-muted-foreground">
            Hierarchical view of your skill proficiency with evidence-based confidence levels
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={activeCategory}
            onChange={e => setActiveCategory(e.target.value)}
            className="px-3 py-2 text-sm border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {cat === 'all' ? 'All Categories' : cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Radar Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Proficiency Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center">
            <RadarChart data={radarData} />
          </div>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {categorySkills.length} categories with proficiency data. Grey area shows average benchmark.
          </p>
        </CardContent>
      </Card>

      {/* Skill Tree Tabs by Category */}
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {categories.map(cat => (
            <TabsTrigger key={cat} value={cat} className="text-sm">
              {cat === 'all' ? 'All' : cat}
            </TabsTrigger>
          ))}
        </TabsList>

        {categories.map(cat => (
          <TabsContent key={cat} value={cat} className="space-y-4">
            <Card>
              <CardContent className="pt-6 max-h-[600px] overflow-y-auto pr-2">
                {roots.filter(r => cat === 'all' || r.category === cat).map(root => renderNode(root))}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Legend */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="font-medium">Confidence Levels:</span>
            <div className="flex items-center gap-1 px-2 py-1 rounded border border-green-200 bg-green-50 text-green-700">
              <TrendingUp className="h-3 w-3" /> High (≥3 high-confidence evidence)
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded border border-yellow-200 bg-yellow-50 text-yellow-700">
              <Target className="h-3 w-3" /> Medium (≥1 high/medium evidence)
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded border border-orange-200 bg-orange-50 text-orange-700">
              <AlertTriangle className="h-3 w-3" /> Low (only low-confidence evidence)
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded border border-border bg-muted text-muted-foreground">
              <Brain className="h-3 w-3" /> Insufficient (< 3 evidence points)
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}