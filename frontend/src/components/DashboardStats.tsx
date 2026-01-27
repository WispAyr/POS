import { useEffect, useState } from 'react';
import axios from 'axios';
import { Activity, ShieldAlert, Car, Clock } from 'lucide-react';
import { StatsCard } from './StatsCard';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Stats {
    sessions: number;
    decisions: number;
    timestamp: string;
}

export function DashboardStats() {
    const [stats, setStats] = useState<Stats | null>(null);

    useEffect(() => {
        // Poll stats every 5 seconds
        const fetchStats = async () => {
            try {
                const { data } = await axios.get('/api/stats');
                setStats(data);
            } catch (error) {
                console.error('Failed to fetch stats', error);
            }
        };

        fetchStats();
        const interval = setInterval(fetchStats, 5000);
        return () => clearInterval(interval);
    }, []);

    if (!stats) return <div>Loading stats...</div>;

    const chartData = [
        { name: 'Sessions', value: stats.sessions },
        { name: 'Violations', value: stats.decisions },
    ];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatsCard
                    title="Active Sessions"
                    value={stats.sessions}
                    icon={Car}
                    trend="+12%"
                />
                <StatsCard
                    title="Pending Reviews"
                    value={stats.decisions}
                    icon={ShieldAlert}
                    trend="+5%"
                />
                <StatsCard
                    title="System Health"
                    value="98.5%"
                    icon={Activity}
                />
                <StatsCard
                    title="Avg. Duration"
                    value="45m"
                    icon={Clock}
                />
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-80">
                <h3 className="text-lg font-semibold mb-4">Activity Overview</h3>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
