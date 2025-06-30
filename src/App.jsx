// src/App.jsx

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import axios from 'axios';
import { contractAddress, abi } from './config.js';
import './App.css';

function App() {
  // State Management
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [owner, setOwner] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Helper function to handle contract interaction errors
  const handleContractError = (error, defaultMessage) => {
    console.error(error);
    const message = error?.data?.message || error.message || defaultMessage;
    alert(`Error: ${message}`);
  };

  // --- Core Functions ---
  const connectWallet = async () => {
    try {
      if (!window.ethereum) return alert('Please install MetaMask.');
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const userAccount = await signer.getAddress();
      const contractInstance = new ethers.Contract(contractAddress, abi, signer);
      setAccount(userAccount);
      setContract(contractInstance);
    } catch (error) { handleContractError(error, "Failed to connect wallet."); }
  };
  
  const fetchReports = async () => {
    if (!contract) return;
    setLoading(true);
    try {
      const count = await contract.getReportCount();
      const fetchedReports = [];
      for (let i = 1; i <= count; i++) {
        const report = await contract.reports(i);
        if (report.isActive) fetchedReports.push(report);
      }
      setReports(fetchedReports.sort((a, b) => Number(b.timestamp) - Number(a.timestamp)));
    } catch (error) { handleContractError(error, "Failed to fetch reports."); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !title) return alert("Please provide a title and select a file.");
    if (!import.meta.env.VITE_PINATA_API_KEY || !import.meta.env.VITE_PINATA_SECRET_API_KEY) {
      return alert("Pinata API Keys are missing! Check your .env.local file.");
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", formData, {
        headers: {
          'Content-Type': `multipart/form-data; boundary=${formData._boundary}`,
          'pinata_api_key': import.meta.env.VITE_PINATA_API_KEY,
          'pinata_secret_api_key': import.meta.env.VITE_PINATA_SECRET_API_KEY
        }
      });
      const tx = await contract.addReport(title, res.data.IpfsHash);
      await tx.wait();
      alert("Report submitted successfully!");
      setTitle('');
      e.target.reset();
      fetchReports();
    } catch (error) { handleContractError(error, "Submission failed. You may not be authorized."); }
    finally { setUploading(false); }
  };

  const handleDelete = async (reportId) => {
    if (!contract || !window.confirm("Are you sure you want to delete this report?")) return;
    try {
      const tx = await contract.deleteReport(reportId);
      await tx.wait();
      alert("Report deleted!");
      fetchReports();
    } catch (error) { handleContractError(error, "Deletion failed."); }
  };
  
  const handleAuthorize = async (e) => {
    e.preventDefault();
    const address = e.target.address.value;
    if (!ethers.isAddress(address)) return alert("Invalid address.");
    try {
      const tx = await contract.addAuthorized(address);
      await tx.wait();
      alert(`Address ${address} is now authorized.`);
      e.target.reset();
    } catch (error) { handleContractError(error, "Authorization failed. User may already be authorized."); }
  };

  const handleRevoke = async (e) => {
    e.preventDefault();
    const address = e.target.address.value;
    if (!ethers.isAddress(address)) return alert("Invalid address.");
    try {
      const tx = await contract.removeAuthorized(address);
      await tx.wait();
      alert(`Authorization revoked for ${address}.`);
      e.target.reset();
    } catch (error) { handleContractError(error, "Revocation failed. User may not be authorized."); }
  };

  // --- useEffect Hooks for lifecycle management ---
  useEffect(() => {
    if (contract) {
      const getOwner = async () => setOwner(await contract.owner());
      getOwner();
      fetchReports();
    }
  }, [contract]);

  useEffect(() => {
    if (account && owner) setIsOwner(account.toLowerCase() === owner.toLowerCase());
  }, [account, owner]);
  
  useEffect(() => {
    if (window.ethereum) {
      const handler = () => window.location.reload();
      window.ethereum.on('accountsChanged', handler);
      window.ethereum.on('chainChanged', handler);
      return () => {
        window.ethereum.removeListener('accountsChanged', handler);
        window.ethereum.removeListener('chainChanged', handler);
      };
    }
  }, []);

  return (
    <div className="App">
  <div className="container">
    <header className="App-header">
      <h1>Organizational Reports</h1>
      {account ? (
        <div className="account-info">
          <p>Connected: {account.substring(0, 6)}...{account.substring(account.length - 4)}</p>
          {isOwner && <span className="owner-badge">Owner</span>}
        </div>
      ) : (
        <button onClick={connectWallet}>Connect Wallet</button>
      )}
    </header>

    {account ? (
      <main className="App-main">
        {isOwner && (
          <div className="card admin-panel">
            <h2>Admin Panel</h2>
            <div className="admin-forms">
              <form onSubmit={handleAuthorize}>
                <input name="address" type="text" placeholder="0x... address to authorize" required />
                <button type="submit">Grant Access</button>
              </form>
              <form onSubmit={handleRevoke}>
                <input name="address" type="text" placeholder="0x... address to revoke" required />
                <button type="submit">Revoke</button>
              </form>
            </div>
          </div>
        )}

        <div className="card form-container">
          <h2>Submit a New Report</h2>
          <form onSubmit={handleSubmit}>
            <input type="text" placeholder="Report Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <input type="file" onChange={(e) => setFile(e.target.files[0])} required />
            <button type="submit" disabled={uploading}>{uploading ? 'Submitting...' : 'Submit Report'}</button>
          </form>
        </div>

        <div className="card reports-container">
          <h2>Stored Reports</h2>
          {loading ? <p>Loading...</p> : (
            <table>
              <thead>
                <tr>
                  <th>ID</th><th>Title</th><th>Author</th><th>Date</th><th>File</th>
                  {isOwner && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {reports.length > 0 ? reports.map((report) => (
                  <tr key={report.id.toString()}>
                    <td>{report.id.toString()}</td>
                    <td>{report.title}</td>
                    <td title={report.author}>{report.author.substring(0, 6)}...</td>
                    <td>{new Date(Number(report.timestamp) * 1000).toLocaleDateString()}</td>
                    <td>
                      <a href={`https://gateway.pinata.cloud/ipfs/${report.ipfsHash}`} target="_blank" rel="noopener noreferrer">View on IPFS</a>
                    </td>
                    {isOwner && (
                      <td>
                        <button className="delete-button" onClick={() => handleDelete(report.id)}>Delete</button>
                      </td>
                    )}
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={isOwner ? "6" : "5"}>No reports found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </main>
    ) : (
      <p className="connect-prompt">Please connect your wallet to view and manage reports.</p>
    )}
  </div>
</div>
  );
}

export default App;