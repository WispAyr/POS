import { useEffect, useState } from 'react';
import axios from 'axios';
import { MapPin, CheckCircle, XCircle } from 'lucide-react';

interface Site {
    id: string;
    name: string;
    active: boolean;
    createdAt: string;
}

export function SitesList() {
    const [sites, setSites] = useState<Site[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSites = async () => {
            try {
                const { data } = await axios.get('/api/sites');
                setSites(data);
            } catch (error) {
                console.error('Failed to fetch sites', error);
            } finally {
                setLoading(false);
            }
        };

        fetchSites();
    }, []);

    if (loading) return <div>Loading sites...</div>;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">Registered Sites</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-500">
                    <thead className="bg-gray-50 text-gray-700 uppercase">
                        <tr>
                            <th className="px-6 py-3">ID</th>
                            <th className="px-6 py-3">Name</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3">Synced At</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sites.map((site) => (
                            <tr key={site.id} className="border-b hover:bg-gray-50">
                                <td className="px-6 py-4 font-medium text-gray-900 flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-blue-500" />
                                    {site.id}
                                </td>
                                <td className="px-6 py-4">{site.name}</td>
                                <td className="px-6 py-4">
                                    {site.active ? (
                                        <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full w-fit">
                                            <CheckCircle className="w-3 h-3" /> Active
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-red-600 bg-red-50 px-2 py-1 rounded-full w-fit">
                                            <XCircle className="w-3 h-3" /> Inactive
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4">{new Date(site.createdAt).toLocaleDateString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
