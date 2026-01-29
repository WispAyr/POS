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
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden transition-colors">
      <div className="p-6 border-b border-gray-100 dark:border-slate-800">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Registered Sites
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
          <thead className="bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-gray-300 uppercase transition-colors">
            <tr>
              <th className="px-6 py-3">ID</th>
              <th className="px-6 py-3">Name</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Synced At</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((site) => (
              <tr
                key={site.id}
                className="border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <td className="px-6 py-4 font-medium text-gray-900 dark:text-white flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                  {site.id}
                </td>
                <td className="px-6 py-4">{site.name}</td>
                <td className="px-6 py-4">
                  {site.active ? (
                    <span className="flex items-center gap-1 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-full w-fit transition-colors">
                      <CheckCircle className="w-3 h-3" /> Active
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-full w-fit transition-colors">
                      <XCircle className="w-3 h-3" /> Inactive
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {new Date(site.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
