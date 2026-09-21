'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChartComponent, LineChartComponent } from '@/components/ui/chart';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import {
  Users,
  TrendingUp,
  Award,
  AlertTriangle,
  Building2,
  Download,
  GraduationCap,
  BarChart3,
} from 'lucide-react';

interface OverviewData {
  totalStudents: number;
  activeStudents: number;
  avgReadiness: number;
  recentAssessments: number;
  completionRate: number;
  readinessDistribution: Record<string, number>;
  topWeaknesses: Array<{
    skill: string;
    category: string;
    affectedStudents: number;
    avgSeverity: number;
  }>;
}

interface StudentListItem {
  id: string;
  studentId: string;
  name: string;
  email: string;
  department: string | null;
  targetRole: string | null;
  readiness: number;
  assessmentsCompleted: number;
  lastActive: string;
}

interface DepartmentAnalytics {
  department: string;
  studentCount: number;
  avgReadiness: number;
  topWeaknesses: Array<{
    skill: string;
    affectedStudents: number;
    avgSeverity: number;
  }>;
}

interface PlacementReport {
  totalStudents: number;
  placementReady: number;
  needsImprovement: number;
  readinessRate: number;
  commonGaps: Array<{
    skill: string;
    category: string;
    affectedCount: number;
  }>;
  studentsNeedingAttention: Array<{
    id: string;
    studentId: string;
    name: string;
    email: string;
    readiness: number;
    department: string | null;
  }>;
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentAnalytics[]>([]);
  const [placementReport, setPlacementReport] = useState<PlacementReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'departments' | 'placement'>('overview');
  const [studentPage, setStudentPage] = useState(1);

  useEffect(() => {
    fetchAllData();
  }, []);

  async function fetchAllData() {
    try {
      setLoading(true);
      const [overviewRes, studentsRes, deptRes, placementRes] = await Promise.all([
        api.get<{ overview: OverviewData }>('/analytics/college/overview'),
        api.get<{ students: StudentListItem[]; pagination: { totalPages: number } }>('/analytics/college/students?limit=50'),
        api.get<{ departments: DepartmentAnalytics[] }>('/analytics/college/departments'),
        api.get<{ report: PlacementReport }>('/analytics/college/placement-report'),
      ]);
      setOverview(overviewRes.overview);
      setStudents(studentsRes.students);
      setDepartments(deptRes.departments);
      setPlacementReport(placementRes.report);
    } catch (error) {
      console.error('Failed to fetch analytics', error);
    } finally {
      setLoading(false);
    }
  }

  async function exportStudents() {
    try {
      const response = await fetch('/api/backend/analytics/college/export', {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `students-${formatDate(new Date())}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed', error);
    }
  }

  const readinessDistData = overview
    ? Object.entries(overview.readinessDistribution).map(([name, value]) => ({ name, value }))
    : [];

  const deptReadinessData = departments.map(d => ({
    name: d.department,
    readiness: d.avgReadiness,
    students: d.studentCount,
  }));

  if (loading) {
    return (
      <div className="space-y-6">
        <AnalyticsSkeleton />
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="text-center py-12">
        <Building2 className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold">Unable to Load Analytics</h2>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">College Analytics</h1>
          <p className="text-muted-foreground">Institutional insights for placement preparation</p>
        </div>
        <Button variant="outline" onClick={exportStudents}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          icon={<Users className="h-5 w-5" />}
          label="Total Students"
          value={overview.totalStudents}
        />
        <MetricCard
          icon={<GraduationCap className="h-5 w-5" />}
          label="Active (30d)"
          value={overview.activeStudents}
        />
        <MetricCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Avg Readiness"
          value={`${overview.avgReadiness}%`}
        />
        <MetricCard
          icon={<BarChart3 className="h-5 w-5" />}
          label="Assessments (7d)"
          value={overview.recentAssessments}
        />
        <MetricCard
          icon={<Award className="h-5 w-5" />}
          label="Completion Rate"
          value={`${overview.completionRate}%`}
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="overview">
            <BarChart3 className="mr-2 h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="students">
            <Users className="mr-2 h-4 w-4" />
            Students
          </TabsTrigger>
          <TabsTrigger value="departments">
            <Building2 className="mr-2 h-4 w-4" />
            Departments
          </TabsTrigger>
          <TabsTrigger value="placement">
            <Award className="mr-2 h-4 w-4" />
            Placement Report
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Readiness Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <BarChartComponent
                  data={readinessDistData}
                  dataKey="value"
                  nameKey="name"
                  height={300}
                  color="hsl(var(--primary))"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Department Readiness</CardTitle>
              </CardHeader>
              <CardContent>
                <BarChartComponent
                  data={deptReadinessData}
                  dataKey="readiness"
                  nameKey="name"
                  height={300}
                  color="hsl(142 76% 36%)"
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Top Skill Gaps Across College
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {overview.topWeaknesses.map((weakness, index) => (
                  <div key={index} className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
                    <span className="w-8 text-center text-sm font-medium text-muted-foreground">{index + 1}</span>
                    <div className="flex-1">
                      <p className="font-medium">{weakness.skill}</p>
                      <p className="text-sm text-muted-foreground">{weakness.category}</p>
                    </div>
                    <Badge variant="secondary">{weakness.affectedStudents} students</Badge>
                    <Progress value={weakness.avgSeverity} className="w-32" />
                    <span className="text-sm font-mono w-10">{weakness.avgSeverity}%</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Students Tab */}
        <TabsContent value="students" className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 font-medium text-muted-foreground">Student</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Department</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Target Role</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Readiness</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Assessments</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Last Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(student => (
                      <tr key={student.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="p-3">
                          <div className="font-medium">{student.name}</div>
                          <div className="text-xs text-muted-foreground">{student.studentId} • {student.email}</div>
                        </td>
                        <td className="p-3">{student.department || '-'}</td>
                        <td className="p-3">{student.targetRole || '-'}</td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Progress value={student.readiness} className="w-24 h-2" />
                            <span className="font-mono">{student.readiness}%</span>
                          </div>
                        </td>
                        <td className="p-3 text-center">{student.assessmentsCompleted}</td>
                        <td className="p-3 text-muted-foreground">{formatDate(student.lastActive)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Departments Tab */}
        <TabsContent value="departments" className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {departments.map(dept => (
              <Card key={dept.department}>
                <CardHeader>
                  <CardTitle>{dept.department}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Students</p>
                      <p className="text-2xl font-bold">{dept.studentCount}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Readiness</p>
                      <p className="text-2xl font-bold">{dept.avgReadiness}%</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Top Weaknesses</p>
                    <div className="space-y-2">
                      {dept.topWeaknesses.slice(0, 3).map((w, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span>{w.skill}</span>
                          <Badge variant="outline">{w.affectedStudents} students</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Placement Report Tab */}
        <TabsContent value="placement" className="space-y-6">
          {placementReport && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  icon={<Users className="h-5 w-5" />}
                  label="Total Students"
                  value={placementReport.totalStudents}
                />
                <MetricCard
                  icon={<Award className="h-5 w-5" />}
                  label="Placement Ready"
                  value={placementReport.placementReady}
                  color="text-green-600"
                />
                <MetricCard
                  icon={<AlertTriangle className="h-5 w-5" />}
                  label="Needs Improvement"
                  value={placementReport.needsImprovement}
                  color="text-red-600"
                />
                <MetricCard
                  icon={<TrendingUp className="h-5 w-5" />}
                  label="Readiness Rate"
                  value={`${placementReport.readinessRate}%`}
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Common Skill Gaps (Ready Students)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {placementReport.commonGaps.map((gap, index) => (
                      <div key={index} className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
                        <span className="w-8 text-center text-sm font-medium text-muted-foreground">{index + 1}</span>
                        <div className="flex-1">
                          <p className="font-medium">{gap.skill}</p>
                          <p className="text-sm text-muted-foreground">{gap.category}</p>
                        </div>
                        <Badge variant="secondary">{gap.affectedCount} students</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    Students Needing Attention (Readiness < 50%)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left p-3 font-medium text-muted-foreground">Student</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Department</th>
                          <th className="text-center p-3 font-medium text-muted-foreground">Readiness</th>
                        </tr>
                      </thead>
                      <tbody>
                        {placementReport.studentsNeedingAttention.map(student => (
                          <tr key={student.id} className="border-b border-border/50">
                            <td className="p-3">
                              <div className="font-medium">{student.name}</div>
                              <div className="text-xs text-muted-foreground">{student.studentId} • {student.email}</div>
                            </td>
                            <td className="p-3">{student.department || '-'}</td>
                            <td className="p-3 text-center">
                              <span className={`font-mono ${student.readiness < 30 ? 'text-red-600' : 'text-orange-600'}`}>
                                {student.readiness}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricCard({ icon, label, value, color = 'text-primary' }: { icon: React.ReactNode; label: string; value: number | string; color?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${color} bg-current/10`}>
            {icon}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AnalyticsSkeleton() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map(i => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="h-20 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="h-80 bg-muted animate-pulse rounded-lg" />
    </>
  );
}