import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const SchoolPage = () => {
  const location = useLocation();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Extract the `url` parameter from the query string
    const queryParams = new URLSearchParams(location.search);
    const targetUrl = queryParams.get('url');

    if (targetUrl) {
      setUrl(decodeURIComponent(targetUrl));
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [location]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!url) {
    return <div>No URL provided to proxy.</div>;
  }

  return (
    <div>
      <h1>Proxying URL: {url}</h1>
      <iframe
        src={`https://taskmaster.one/api/proxy?url=${encodeURIComponent(url)}`}
        width="100%"
        height="600px"
        style={{ border: 'none' }}
      />
    </div>
  );
};

export default SchoolPage;
