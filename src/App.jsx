import React, { useState, useEffect } from 'react';
import './App.css';
import * as XLSX from 'xlsx';
import { db } from './firebase';
import { doc, setDoc, onSnapshot } from "firebase/firestore";

function App() {
  const [activePlayers, setActivePlayers] = useState([]);
  const [history, setHistory] = useState([]);
  const [gameSettings, setGameSettings] = useState({ maxSellAmount: 1000, maxBuyInAmount: 1000 });
  const [playerBank, setPlayerBank] = useState([]);

  // ID phòng chơi cố định trên Cloud (Mọi người cùng truy cập phòng này)
  const roomId = "poker_room_1";

  // --- 1. KẾT NỐI REAL-TIME VỚI FIRESTORE ---
  useEffect(() => {
    const roomRef = doc(db, "pokerRooms", roomId);
    
    // onSnapshot giúp tự động cập nhật giao diện khi có thay đổi từ bất kỳ điện thoại nào
    const unsubscribe = onSnapshot(roomRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setActivePlayers(data.activePlayers || []);
        setHistory(data.history || []);
        setGameSettings(data.gameSettings || { maxSellAmount: 1000, maxBuyInAmount: 1000 });
        setPlayerBank(data.playerBank || []);
      } else {
        // Nếu phòng chưa tồn tại trên Firestore, khởi tạo dữ liệu mặc định ban đầu
        setDoc(roomRef, {
          activePlayers: [],
          history: [],
          gameSettings: { maxSellAmount: 1000, maxBuyInAmount: 1000 },
          playerBank: []
        });
      }
    });

    return () => unsubscribe();
  }, []);

  // --- 2. HÀM HỖ TRỢ ĐẨY DỮ LIỆU LÊN CLOUD ---
  const syncToCloud = async (updatedData) => {
    try {
      const roomRef = doc(db, "pokerRooms", roomId);
      await setDoc(roomRef, updatedData, { merge: true });
    } catch (error) {
      console.error("Lỗi đồng bộ Firebase: ", error);
    }
  };

  const [newBankName, setNewBankName] = useState('');

  const [transferData, setTransferData] = useState({
    show: false,
    sellerIndex: null,
    buyerIndex: "",
    amount: ""
  });

  const revertLastAction = () => {
    if (history.length === 0) return;

    const lastAction = history[0];
    const confirmRevert = window.confirm(`Revert: "${lastAction.msg}"?`);
    if (!confirmRevert) return;

    let newPlayers = [...activePlayers];

    if (lastAction.msg.includes("Bulk Buy-in")) {
      newPlayers = newPlayers.map(p => ({ ...p, buyIn: 0 }));
    }
    else if (lastAction.msg.includes("Buy-in")) {
      const name = lastAction.msg.split(" Buy-in")[0];
      const amount = parseInt(lastAction.msg.replace(/,/g, "").match(/\d+/));
      newPlayers = newPlayers.map(p => p.name === name ? { ...p, buyIn: p.buyIn - amount } : p);
    }
    else if (lastAction.msg.includes("Cash-out")) {
      const name = lastAction.msg.split(" Cash-out")[0];
      const amount = parseInt(lastAction.msg.replace(/,/g, "").match(/\d+/));
      newPlayers = newPlayers.map(p => p.name === name ? { ...p, cashOut: p.cashOut - amount } : p);
    }

    const newHistory = history.slice(1);
    setActivePlayers(newPlayers);
    setHistory(newHistory);
    
    // Lưu lên Cloud
    syncToCloud({ activePlayers: newPlayers, history: newHistory });
  };

  const handleBulkBuyIn = () => {
    const amount = parseInt(prompt("Enter default Buy-in amount for ALL players:"));
    if (isNaN(amount) || amount <= 0) return;

    if (amount > gameSettings.maxBuyInAmount) {
      alert(`❌ Exceeds limit: ${gameSettings.maxBuyInAmount.toLocaleString()}`);
      return;
    }

    if (window.confirm(`Set Buy-in to ${amount.toLocaleString()} for all ${activePlayers.length} players?`)) {
      const updatedPlayers = activePlayers.map(player => ({
        ...player,
        buyIn: amount
      }));
      const logMsg = `Bulk Buy-in: ${amount.toLocaleString()} for all players`;
      const updatedHistory = [{ msg: logMsg, time: new Date().toLocaleTimeString(), isBulk: true, amount: amount }, ...history];
      
      setActivePlayers(updatedPlayers);
      setHistory(updatedHistory);

      // Lưu lên Cloud
      syncToCloud({ activePlayers: updatedPlayers, history: updatedHistory });
    }
  };

  const resetGame = () => {
    if (window.confirm("Bạn có chắc chắn muốn xóa toàn bộ dữ liệu ván bài này?")) {
      const emptyData = { activePlayers: [], history: [], gameSettings, playerBank };
      setActivePlayers([]);
      setHistory([]);
      syncToCloud(emptyData);
    }
  };

  const [modalConfig, setModalConfig] = useState({
    show: false,
    type: '', // 'buyin' or 'cashout'
    player: null,
    amount: ''
  });

  const isDuplicate = playerBank.includes(newBankName.trim()) && newBankName.trim() !== "";

  const isAtTable = (name) => activePlayers.some(p => p.name === name);

  const addToBank = () => {
    if (newBankName.trim() && !playerBank.includes(newBankName)) {
      const updatedBank = [...playerBank, newBankName.trim()];
      setPlayerBank(updatedBank);
      setNewBankName('');
      syncToCloud({ playerBank: updatedBank });
    }
  };

  const removeFromBank = (name) => {
    if (window.confirm(`Xóa ${name}?`)) {
      const updatedBank = playerBank.filter(n => n !== name);
      setPlayerBank(updatedBank);
      syncToCloud({ playerBank: updatedBank });
    }
  };

  const joinGame = (name) => {
    if (activePlayers.length < 20 && !isAtTable(name)) {
      const updatedPlayers = [...activePlayers, { name, buyIn: 0, cashOut: 0 }];
      setActivePlayers(updatedPlayers);
      syncToCloud({ activePlayers: updatedPlayers });
    }
  };

  const leaveTable = (index) => {
    if (window.confirm(`Cho ${activePlayers[index].name} rời bàn?`)) {
      const updatedPlayers = activePlayers.filter((_, i) => i !== index);
      setActivePlayers(updatedPlayers);
      syncToCloud({ activePlayers: updatedPlayers });
    }
  };

  const isOverLimit = Number(modalConfig.amount) > Number(gameSettings.maxBuyInAmount);

  const openModal = (player, type) => {
    setModalConfig({
      show: true,
      type: type,
      player: player,
      amount: ''
    });
  };

  const closeModal = () => {
    setModalConfig({ show: false, type: '', player: null, amount: '' });
  };

  const handleConfirmAction = () => {
    const { player, type, amount } = modalConfig;
    const numAmount = parseInt(amount);

    if (isNaN(numAmount) || numAmount <= 0) return;

    if (type === 'buyin') {
      const maxLimit = parseInt(gameSettings.maxBuyInAmount);
      if (player.buyIn + numAmount > maxLimit) return;
    }

    const updatedPlayers = activePlayers.map(p => {
      if (p.name === player.name) {
        return {
          ...p,
          buyIn: type === 'buyin' ? p.buyIn + numAmount : p.buyIn,
          cashOut: type === 'cashout' ? p.cashOut + numAmount : p.cashOut
        };
      }
      return p;
    });

    const logMsg = type === 'buyin'
      ? `${player.name} Buy-in +${numAmount.toLocaleString()}`
      : `${player.name} Cash-out +${numAmount.toLocaleString()}`;

    const updatedHistory = [
      { id: Date.now(), msg: logMsg, timestamp: new Date().toLocaleTimeString() },
      ...history
    ];

    setActivePlayers(updatedPlayers);
    setHistory(updatedHistory);
    closeModal();

    // Lưu lên Cloud
    syncToCloud({ activePlayers: updatedPlayers, history: updatedHistory });
  };

  const executeTransfer = () => {
    const { sellerIndex, buyerIndex, amount } = transferData;
    const numAmount = parseInt(amount);

    if (buyerIndex === "" || isNaN(numAmount) || numAmount <= 0) {
      alert("Vui lòng nhập số tiền hợp lệ!");
      return;
    }

    if (numAmount > gameSettings.maxSellAmount) {
      alert(`❌ Lỗi: Số tiền vượt quá giới hạn (${gameSettings.maxSellAmount.toLocaleString()})`);
      return;
    }

    const updatedPlayers = [...activePlayers];
    updatedPlayers[sellerIndex].cashOut += numAmount;
    updatedPlayers[buyerIndex].buyIn += numAmount;

    const logEntry = {
      id: Date.now(),
      msg: `${activePlayers[sellerIndex].name} sold ${numAmount.toLocaleString()} to ${activePlayers[buyerIndex].name}`,
      timestamp: new Date().toLocaleTimeString()
    };

    const updatedHistory = [logEntry, ...history];

    setActivePlayers(updatedPlayers);
    setHistory(updatedHistory);
    setTransferData({ show: false, sellerIndex: null, buyerIndex: "", amount: "" });

    // Lưu lên Cloud
    syncToCloud({ activePlayers: updatedPlayers, history: updatedHistory });
  };

  const totalBuyIn = activePlayers.reduce((sum, p) => sum + p.buyIn, 0);
  const totalCashOut = activePlayers.reduce((sum, p) => sum + p.cashOut, 0);

  const handleEndGame = () => {
    if (!window.confirm("Bạn có chắc muốn kết thúc và xuất file Excel?")) return;

    const summaryData = activePlayers.map(p => ({
      "Tên người chơi": p.name,
      "Tổng Buy-in": p.buyIn,
      "Tổng Cash-out": p.cashOut || 0,
      "Kết quả (P/L)": (p.cashOut || 0) - p.buyIn,
      "Trạng thái": (p.cashOut || 0) - p.buyIn >= 0 ? "Thắng" : "Thua"
    }));

    const logData = history.map(h => ({
      "Thời gian": h.timestamp,
      "Nội dung sự kiện": h.msg
    }));

    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    const wsLogs = XLSX.utils.json_to_sheet(logData);

    const autoWidth = (data) => {
      if (data.length === 0) return [];
      const keys = Object.keys(data[0]);
      return keys.map(key => {
        const maxLen = data.reduce((max, row) => {
          const cellValue = row[key] ? row[key].toString() : "";
          return Math.max(max, cellValue.length);
        }, key.length);
        return { wch: maxLen + 5 };
      });
    };

    wsSummary['!cols'] = autoWidth(summaryData);
    wsLogs['!cols'] = autoWidth(logData);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsSummary, "Tong Ket");
    XLSX.utils.book_append_sheet(wb, wsLogs, "Lich Su Game");

    const fileName = `Poker_Report_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="App">
      <header><h1>♠️ POKER MANAGER PRO ♠️ </h1></header>

      <div className="main-layout">
        <aside className="player-management">
          <h3>PLAYER BANK</h3>
          <div className="add-to-bank">
            <input
              id="player-name-input"
              value={newBankName}
              onChange={(e) => setNewBankName(e.target.value)}
              placeholder="Tên..."
              className={isDuplicate ? "duplicate-error" : ""}
              autoComplete="off"
            />

            <button
              className="btn-save-bank"
              onClick={addToBank}
              disabled={isDuplicate || !newBankName.trim()}
            >
              Save
            </button>
          </div>
          <ul className="bank-list">
            {playerBank.map((name, i) => (
              <li key={i} className={isAtTable(name) ? "in-game" : ""}>
                <div className="bank-item-header"><span>{name}</span><button className="btn-del" onClick={() => removeFromBank(name)}>×</button></div>
                <button className="btn-join" onClick={() => joinGame(name)} disabled={isAtTable(name)}>
                  {isAtTable(name) ? "Playing" : "Join"}
                </button>
              </li>
            ))}
          </ul>

          <section className="history-log">
            <div className="log-header">
              <h3>📜 Game Log</h3>
              <button
                className="btn-revert-action"
                onClick={revertLastAction}
                disabled={history.length === 0}
              >
                ↩️ Undo
              </button>
            </div>

            <ul>
              {history.map(item => (
                <li key={item.id}>
                  <small>{item.timestamp}</small>
                  <span>{item.msg}</span>
                </li>
              ))}
            </ul>

            <div className="log-footer">
              <span>Events: {history.length}</span>
              <button
                className="btn-clear-log"
                onClick={() => {
                  setHistory([]);
                  syncToCloud({ history: [] });
                }}
                disabled={activePlayers.length > 0}
                title={activePlayers.length > 0 ? "Cannot clear log while game is active" : ""}
              >
                Clear
              </button>
            </div>
          </section>

          <section className="game-settings">
            <div className="settings-header">
              <h3>⚙️ Game Settings</h3>
            </div>

            <div className="settings-body">
              <div className="setting-item">
                <label>Max Buy-in, cash-out Limit</label>
                <div className="modern-input-group">
                  <input
                    className="modern-input"
                    type="number"
                    value={gameSettings.maxBuyInAmount}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      const updatedSettings = { ...gameSettings, maxBuyInAmount: val };
                      setGameSettings(updatedSettings);
                      syncToCloud({ gameSettings: updatedSettings });
                    }}
                  />
                  <span className="input-badge">chips</span>
                </div>
              </div>

              <div className="setting-item">
                <label>Max Sell Limit</label>
                <div className="modern-input-group">
                  <input
                    className="modern-input"
                    type="number"
                    value={gameSettings.maxSellAmount}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      const updatedSettings = { ...gameSettings, maxSellAmount: val };
                      setGameSettings(updatedSettings);
                      syncToCloud({ gameSettings: updatedSettings });
                    }}
                  />
                  <span className="input-badge">chips</span>
                </div>
              </div>

              <div className="settings-divider"></div>

              <div className="admin-quick-actions">
                <button className="btn-bulk-buyin" onClick={handleBulkBuyIn} disabled={activePlayers.length === 0}>
                  💰 BULK BUY-IN
                </button>
                <button className="btn-end-game-side" onClick={handleEndGame}>
                  🏁 END & EXPORT
                </button>
                <button className="btn-reset-side" onClick={resetGame}>
                  🗑️ Reset Table
                </button>
              </div>
            </div>
          </section>
        </aside>

        <main className="game-table">
          <div className="table-header"><h2>ACTIVE TABLE ({activePlayers.length}/20)</h2></div>
          <div className="player-grid">
            {activePlayers.map((player, index) => {
              const profit = player.cashOut - player.buyIn;
              return (
                <div key={index} className="player-card">
                  <button className="btn-leave-x" onClick={() => leaveTable(index)}>×</button>
                  <h3>{player.name}</h3>
                  <div className="stats-container">
                    <div className="stat-box in"><span className="stat-label">Total In</span><span className="stat-value">{player.buyIn.toLocaleString()}</span></div>
                    <div className="stat-box out"><span className="stat-label">Total Out</span><span className="stat-value">{player.cashOut.toLocaleString()}</span></div>
                  </div>
                  <div className={`profit-badge ${profit >= 0 ? 'plus' : 'minus'}`}>
                    <span className="profit-label">NET PROFIT</span>
                    <span className="profit-amount">{profit >= 0 ? '+' : ''}{profit.toLocaleString()}</span>
                  </div>
                  <div className="card-actions">
                    <button className="btn-buyin-action" onClick={() => openModal(player, 'buyin')}>
                      BUY IN
                    </button>
                    <button className="btn-cashout-action" onClick={() => openModal(player, 'cashout')}>
                      CASH OUT
                    </button>
                    <button className="btn-sell-action" onClick={() => setTransferData({ ...transferData, show: true, sellerIndex: index })}>Sell Chips</button>
                  </div>
                </div>
              );
            })}
          </div>

          <section className={`summary ${totalBuyIn === totalCashOut ? 'balanced' : 'unbalanced'}`}>
            <div className="sum-item"><span>Total In</span><strong>{totalBuyIn.toLocaleString()}</strong></div>
            <div className="sum-item"><span>Total Out</span><strong>{totalCashOut.toLocaleString()}</strong></div>
            <div className="sum-item"><span>Diff</span><strong>{(totalBuyIn - totalCashOut).toLocaleString()}</strong></div>
            <div className="balance-status">{totalBuyIn === totalCashOut ? "✅ BALANCED" : "⚠️ CHECK CHIPS"}</div>
          </section>
        </main>
      </div>

      {transferData.show && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>🔄 Chuyển Chip từ {activePlayers[transferData.sellerIndex].name}</h3>
            <div className="modal-body">
              <div className="input-group">
                <label><span className="icon">👤</span> Người nhận Chip</label>
                <select value={transferData.buyerIndex} onChange={(e) => setTransferData({ ...transferData, buyerIndex: e.target.value })}>
                  <option value="">-- Chọn một người chơi --</option>
                  {activePlayers.map((p, i) => (
                    i !== transferData.sellerIndex && <option key={i} value={i}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label><span className="icon">💰</span> Số lượng Chip chuyển</label>
                <div className="modern-input-group">
                  <input
                    className="modern-input"
                    type="number"
                    value={transferData.amount}
                    onChange={(e) => setTransferData({ ...transferData, amount: e.target.value })}
                    placeholder="0"
                  />
                  <span className="input-badge">chips</span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setTransferData({ show: false, sellerIndex: null, buyerIndex: "", amount: "" })}>Hủy</button>
              <button className="btn-confirm" onClick={executeTransfer}>Xác nhận Sell</button>
            </div>
          </div>
        </div>
      )}
      {modalConfig.show && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2 style={{ color: modalConfig.type === 'buyin' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                {modalConfig.type === 'buyin' ? '💰 ADD BUY-IN' : '💵 CASH OUT'}
              </h2>
              <p>{modalConfig.player.name}</p>
            </div>

            <div className="modal-body">
              <div className="input-group">
                <label>ENTER AMOUNT</label>
                <div className="input-with-suffix">
                  <input
                    type="number"
                    autoFocus
                    placeholder="0"
                    className={isOverLimit ? 'invalid-limit' : ''}
                    value={modalConfig.amount}
                    onChange={(e) => setModalConfig({ ...modalConfig, amount: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && !isOverLimit && handleConfirmAction()}
                  />
                  <span className="suffix">CHIPS</span>
                </div>
                {isOverLimit && (
                  <p style={{ color: 'var(--accent-red)', fontSize: '11px', marginTop: '8px', fontWeight: 'bold' }}>
                    ⚠️ Exceeds Max Limit of {parseInt(gameSettings.maxBuyInAmount).toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-cancel" onClick={closeModal}>CANCEL</button>
              <button
                className="btn-confirm"
                style={{ background: modalConfig.type === 'buyin' ? 'var(--accent-green)' : 'var(--accent-red)' }}
                onClick={handleConfirmAction}
              >
                CONFIRM
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;