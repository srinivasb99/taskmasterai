import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styled from 'styled-components';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #0f0f0f;
  color: white;
`;

const NavBar = styled.div`
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: #1a1a1a;
  border-bottom: 1px solid #333;
`;

const NavButton = styled.button`
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  background: #333;
  color: white;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #444;
  }

  &:disabled {
    background: #222;
    color: #666;
    cursor: not-allowed;
  }
`;

const SearchBar = styled.form`
  flex: 1;
  display: flex;
  gap: 0.5rem;
`;

const SearchInput = styled.input`
  flex: 1;
  padding: 0.8rem;
  border: none;
  border-radius: 4px;
  background: #333;
  color: white;
  font-size: 1rem;

  &:focus {
    outline: 2px solid #00a8ff;
  }
`;

const QuickLinks = styled.div`
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: #1a1a1a;
`;

const QuickLink = styled.button`
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 20px;
  background: #333;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  &:hover {
    background: #444;
    transform: translateY(-2px);
  }
`;

const IframeContainer = styled.div`
  flex: 1;
  background: black;
  iframe {
    width: 100%;
    height: 100%;
    border: none;
  }
`;

const SchoolPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const targetUrl = queryParams.get('url');
    
    if (targetUrl) {
      const decodedUrl = decodeURIComponent(targetUrl);
      setUrl(decodedUrl);
      setHistory([decodedUrl]);
      setCurrentHistoryIndex(0);
    }
    setIsLoading(false);
  }, [location.search]);

  const handleSearch = (e: React.FormEvent, newUrl?: string) => {
    e.preventDefault();
    const input = newUrl || url;
    if (!input) return;

    const encodedUrl = encodeURIComponent(input);
    navigate(`?url=${encodedUrl}`);
    
    // Update history
    const newHistory = history.slice(0, currentHistoryIndex + 1);
    newHistory.push(input);
    setHistory(newHistory);
    setCurrentHistoryIndex(newHistory.length - 1);
  };

  const handleBack = () => {
    if (currentHistoryIndex > 0) {
      const newIndex = currentHistoryIndex - 1;
      setCurrentHistoryIndex(newIndex);
      setUrl(history[newIndex]);
      navigate(`?url=${encodeURIComponent(history[newIndex])}`);
    }
  };

  const handleForward = () => {
    if (currentHistoryIndex < history.length - 1) {
      const newIndex = currentHistoryIndex + 1;
      setCurrentHistoryIndex(newIndex);
      setUrl(history[newIndex]);
      navigate(`?url=${encodeURIComponent(history[newIndex])}`);
    }
  };

  const setQuickLink = (site: string) => {
    setUrl(site);
    handleSearch(new Event('submit') as unknown as React.FormEvent, site);
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <Container>
      <QuickLinks>
        <QuickLink onClick={() => setQuickLink('https://youtube.com')}>
          <i className="fab fa-youtube" /> YouTube
        </QuickLink>
        <QuickLink onClick={() => setQuickLink('https://google.com')}>
          <i className="fab fa-google" /> Google
        </QuickLink>
        <QuickLink onClick={() => setQuickLink('https://netflix.com')}>
          <i className="fab fa-netflix" /> Netflix
        </QuickLink>
        <QuickLink onClick={() => setQuickLink('https://disneyplus.com')}>
          <i className="fab fa-disney" /> Disney+
        </QuickLink>
      </QuickLinks>

      <NavBar>
        <NavButton onClick={handleBack} disabled={currentHistoryIndex <= 0}>
          ← Back
        </NavButton>
        <NavButton 
          onClick={handleForward} 
          disabled={currentHistoryIndex >= history.length - 1}
        >
          Forward →
        </NavButton>
        
        <SearchBar onSubmit={handleSearch}>
          <SearchInput
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter website URL"
          />
          <NavButton type="submit">Go</NavButton>
        </SearchBar>
      </NavBar>

      <IframeContainer>
        <iframe
          src={`https://taskmaster.one/api/proxy?url=${encodeURIComponent(url)}`}
          title="proxy-frame"
        />
      </IframeContainer>
    </Container>
  );
};

export default SchoolPage;
