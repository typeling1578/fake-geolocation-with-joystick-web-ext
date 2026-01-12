import { useState } from "react";

const App = () => {
  const [licenses, setLicenses] = useState([]);

  useEffect(() => {
    fetch("/licenses.json")
      .then(res => res.json())
      .then(data => setLicenses(data));
  }, []);

  return (
    <div>
      <h1>OSS Licenses</h1>
      {Object.entries(licenses).map(([name, info]: any) => (
        <div key={name}>
          <h3>{name}</h3>
          {info.copyright && <p>Copyright: {info.copyright}</p>}
          {info.repository && <p>Repository: {info.repository}</p>}
          <p>License: {info.licenses}</p>
          <pre>{info.licenseText}</pre>
        </div>
      ))}
    </div>
  );
};

export default App;
