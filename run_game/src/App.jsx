// src/App.js - Binary Protocol Version
import { useState, useRef } from 'react';

// Unity와 동일한 프로토콜 상수
const MESSAGE_HEAD_CODE = 0xFD;
const MESSAGE_END_CODE = 0xED;

const MessageCommand = {
  KEYPOINT_BOX_DETECTION: 0,
  CLASSIFICATION: 1,
  DETECTION: 2
};

// FSM States
const ReceiveState = {
  WAIT_START: 0,
  HEAD: 1,
  DATA: 2,
  CRC: 3,
  END: 4
};

// 프로토콜 파서 클래스
class AiCamProtocol {
  constructor() {
    this.state = ReceiveState.WAIT_START;
    this.currentMessage = null;
    this.receiveBuffer = [];
  }

  feedByte(byte) {
    switch (this.state) {
      case ReceiveState.WAIT_START:
        if (byte === MESSAGE_HEAD_CODE) {
          this.currentMessage = {
            head: { head: byte, cmd: 0, length: 0 },
            data: [],
            crc: 0,
            end: 0
          };
          this.receiveBuffer = [];
          this.state = ReceiveState.HEAD;
        }
        break;

      case ReceiveState.HEAD:
        this.receiveBuffer.push(byte);
        if (this.receiveBuffer.length === 3) {
          this.currentMessage.head.cmd = this.receiveBuffer[0];
          this.currentMessage.head.length = this.receiveBuffer[1] | (this.receiveBuffer[2] << 8);
          this.receiveBuffer = [];
          this.state = ReceiveState.DATA;
        }
        break;

      case ReceiveState.DATA:
        this.receiveBuffer.push(byte);
        if (this.receiveBuffer.length === this.currentMessage.head.length) {
          this.currentMessage.data = [...this.receiveBuffer];
          this.receiveBuffer = [];
          this.state = ReceiveState.CRC;
        }
        break;

      case ReceiveState.CRC:
        this.receiveBuffer.push(byte);
        if (this.receiveBuffer.length === 4) {
          // CRC 계산 (간단히 skip)
          this.currentMessage.crc = this.receiveBuffer[0] |
            (this.receiveBuffer[1] << 8) |
            (this.receiveBuffer[2] << 16) |
            (this.receiveBuffer[3] << 24);
          this.receiveBuffer = [];
          this.state = ReceiveState.END;
        }
        break;

      case ReceiveState.END:
        if (byte === MESSAGE_END_CODE) {
          this.state = ReceiveState.WAIT_START;
          this.currentMessage.end = byte;
          return this.currentMessage;
        }
        break;

      default:
        break;
    }
    return null;
  }

  reset() {
    this.state = ReceiveState.WAIT_START;
    this.currentMessage = null;
    this.receiveBuffer = [];
  }
}

function App() {
  const [port, setPort] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [sensorValue, setSensorValue] = useState('-');
  const [showAdmin, setShowAdmin] = useState(false);
  const [rawDataLog, setRawDataLog] = useState([]);
  const [parsedDataLog, setParsedDataLog] = useState([]);
  const [camIDInput, setCamIDInput] = useState(99);

  const iframeRef = useRef(null);
  const protocolRef = useRef(new AiCamProtocol());

  const MAX_LOG_SIZE = 100;

  // 아두이노 연결
  const connectArduino = async () => {
    try {
      const selectedPort = await navigator.serial.requestPort();
      await selectedPort.open({ baudRate: 9600 });
      setPort(selectedPort);
      setIsConnected(true);
      protocolRef.current.reset();
      readSensorData(selectedPort);
    } catch (error) {
      console.error('연결 실패:', error);
      alert('아두이노 연결에 실패했습니다.');
    }
  };

  // 센서 데이터 읽기 (바이너리 프로토콜)
  const readSensorData = async (port) => {
    const reader = port.readable.getReader();

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          reader.releaseLock();
          break;
        }

        // Uint8Array를 바이트 단위로 처리
        for (let i = 0; i < value.length; i++) {
          const byte = value[i];

          // 로우 데이터 로깅
          addRawDataLog(`0x${byte.toString(16).padStart(2, '0')}`);

          // 프로토콜 파싱
          const message = protocolRef.current.feedByte(byte);

          if (message) {
            console.log('📦 [완성된 메시지]:', message);
            handleMessage(message);
          }
        }
      }
    } catch (error) {
      console.error('시리얼 읽기 오류:', error);
    }
  };

  // 메시지 처리
  const handleMessage = (msg) => {
    if (msg.head.cmd === MessageCommand.CLASSIFICATION) {
      const type = msg.data[0];
      console.log(`🎯 [Classification] Type: ${type}`);

      for (let i = 1; i < msg.head.length; i += 2) {
        const id = msg.data[i];
        const confidence = msg.data[i + 1];
        console.log(`ID: ${id}, Confidence: ${confidence}`);

        setCamIDInput(id);
        setSensorValue(`ID:${id} (${confidence}%)`);

        addParsedDataLog({
          type: 'CLASSIFICATION',
          id: id,
          confidence: confidence
        });

        // Unity 로직과 동일하게 처리
        if (id === 2) {
          console.log('🎯 제스처 감지! 클릭 시도...');
          simulateMouseClick();
        }
      }
    }
    else if (msg.head.cmd === MessageCommand.DETECTION) {
      const type = msg.data[0];
      console.log(`📍 [Detection] Type: ${type}`);

      for (let i = 1; i < msg.head.length; i += 6) {
        if (i + 5 >= msg.head.length) break;

        const id = msg.data[i];
        const x = msg.data[i + 1];
        const y = msg.data[i + 2];
        const w = msg.data[i + 3];
        const h = msg.data[i + 4];
        const confidence = msg.data[i + 5];

        console.log(`ID: ${id}, X: ${x}, Y: ${y}, W: ${w}, H: ${h}, Conf: ${confidence}`);

        setCamIDInput(id);
        setSensorValue(`ID:${id} @(${x},${y})`);

        addParsedDataLog({
          type: 'DETECTION',
          id: id,
          x: x,
          y: y,
          w: w,
          h: h,
          confidence: confidence
        });
      }
    }
  };

  // 로우 데이터 로그 추가
  const addRawDataLog = (data) => {
    const timestamp = new Date().toLocaleTimeString('ko-KR', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });

    setRawDataLog(prev => {
      const newLog = [{
        timestamp,
        data: data,
        type: 'byte'
      }, ...prev];
      return newLog.slice(0, MAX_LOG_SIZE);
    });
  };

  // 파싱된 데이터 로그 추가
  const addParsedDataLog = (data) => {
    const timestamp = new Date().toLocaleTimeString('ko-KR', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });

    setParsedDataLog(prev => {
      const newLog = [{
        timestamp,
        ...data
      }, ...prev];
      return newLog.slice(0, MAX_LOG_SIZE);
    });
  };

  // 로그 클리어
  const clearLogs = () => {
    setRawDataLog([]);
    setParsedDataLog([]);
  };

  // 🖱️ iframe 내부 canvas에 마우스 클릭 전달
  const simulateMouseClick = () => {
    try {
      if (!iframeRef.current) return;

      const iframeDoc = iframeRef.current.contentDocument ||
        iframeRef.current.contentWindow.document;
      if (!iframeDoc) return;

      const canvas = iframeDoc.getElementById('c2canvas');
      if (!canvas) return;

      console.log('Canvas 찾음! 클릭 이벤트 발생...');

      const rect = canvas.getBoundingClientRect();
      const x = rect.width / 2;
      const y = rect.height / 2;

      const mouseDownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: iframeRef.current.contentWindow,
        button: 0,
        buttons: 1,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y
      });
      canvas.dispatchEvent(mouseDownEvent);

      setTimeout(() => {
        const mouseUpEvent = new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          view: iframeRef.current.contentWindow,
          button: 0,
          buttons: 0,
          clientX: x,
          clientY: y,
          screenX: x,
          screenY: y
        });
        canvas.dispatchEvent(mouseUpEvent);
      }, 50);

      setTimeout(() => {
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: iframeRef.current.contentWindow,
          button: 0,
          clientX: x,
          clientY: y,
          screenX: x,
          screenY: y
        });
        canvas.dispatchEvent(clickEvent);
      }, 100);

    } catch (error) {
      console.error('클릭 시뮬레이션 오류:', error);
    }
  };

  // 연결 해제
  const disconnect = async () => {
    if (port) {
      await port.close();
      setPort(null);
      setIsConnected(false);
      setSensorValue('-');
      setCamIDInput(99);
      protocolRef.current.reset();
    }
  };

  return (
    <div style={{ backgroundColor: 'black', minHeight: '100vh' }}>
      {/* 컨트롤 패널 */}
      <div style={{
        textAlign: 'center',
        padding: '20px',
        background: 'rgba(255,255,255,0.1)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '20px',
        flexWrap: 'wrap'
      }}>
        {!isConnected ? (
          <button
            onClick={connectArduino}
            style={{
              padding: '15px 30px',
              fontSize: '18px',
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
            }}
          >
            🔌 아두이노 연결
          </button>
        ) : (
          <button
            onClick={disconnect}
            style={{
              padding: '15px 30px',
              fontSize: '18px',
              background: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            🔴 연결 해제
          </button>
        )}

        {/* 센서값 표시 */}
        <div style={{
          background: 'white',
          color: 'black',
          padding: '10px 20px',
          borderRadius: '8px',
          fontSize: '18px',
          fontWeight: 'bold'
        }}>
          <div>센서값: <span style={{ color: '#4CAF50', fontSize: '20px' }}>{sensorValue}</span></div>
          <div style={{ fontSize: '14px', color: '#666' }}>Cam ID: {camIDInput}</div>
        </div>

        {/* 수동 테스트 버튼 */}
        <button
          onClick={simulateMouseClick}
          style={{
            padding: '15px 30px',
            fontSize: '18px',
            background: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          🧪 클릭 테스트
        </button>

        {/* 어드민 버튼 */}
        <button
          onClick={() => setShowAdmin(true)}
          style={{
            padding: '15px 30px',
            fontSize: '18px',
            background: '#9C27B0',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          ⚙️ 프로토콜 모니터
        </button>
      </div>

      {/* 게임 iframe */}
      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        <iframe
          ref={iframeRef}
          src="/game/index.html"
          width="1280"
          height="720"
          style={{ border: 'none' }}
          title="Ninja Game"
        />
      </div>

      {/* 사용 안내 */}
      <div style={{
        textAlign: 'center',
        color: 'white',
        marginTop: '20px',
        fontSize: '16px'
      }}>
        <p>💡 바이너리 프로토콜 방식 (Unity와 동일)</p>
        <p>🎯 제스처 ID가 2이면 자동 점프!</p>
        {isConnected && <p style={{ color: '#4CAF50' }}>✅ 아두이노 연결됨</p>}
      </div>

      {/* 어드민 모달 - 프로토콜 버전 */}
      {showAdmin && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            width: '90%',
            maxWidth: '1200px',
            height: '80%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* 모달 헤더 */}
            <div style={{
              background: '#9C27B0',
              color: 'white',
              padding: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ margin: 0 }}>⚙️ 바이너리 프로토콜 모니터</h2>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={clearLogs}
                  style={{
                    padding: '10px 20px',
                    background: '#FF9800',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  🗑️ 클리어
                </button>
                <button
                  onClick={() => setShowAdmin(false)}
                  style={{
                    padding: '10px 20px',
                    background: '#f44336',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  ✕ 닫기
                </button>
              </div>
            </div>

            {/* 모달 본문 */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* 로우 바이트 */}
              <div style={{ flex: 1, borderRight: '2px solid #ddd', display: 'flex', flexDirection: 'column' }}>
                <div style={{
                  background: '#f5f5f5',
                  padding: '15px',
                  borderBottom: '2px solid #ddd',
                  fontWeight: 'bold'
                }}>
                  📡 로우 바이트 ({rawDataLog.length})
                </div>
                <div style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '10px',
                  fontFamily: 'monospace',
                  fontSize: '13px'
                }}>
                  {rawDataLog.map((log, index) => (
                    <div key={index} style={{
                      padding: '5px',
                      background: index === 0 ? '#E3F2FD' : '#f9f9f9',
                      marginBottom: '3px',
                      borderLeft: '3px solid #2196F3'
                    }}>
                      <span style={{ color: '#666', fontSize: '11px' }}>{log.timestamp}</span>
                      {' → '}
                      <span style={{ color: '#d32f2f', fontWeight: 'bold' }}>{log.data}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 파싱된 메시지 */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{
                  background: '#f5f5f5',
                  padding: '15px',
                  borderBottom: '2px solid #ddd',
                  fontWeight: 'bold'
                }}>
                  🔍 파싱된 메시지 ({parsedDataLog.length})
                </div>
                <div style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '10px',
                  fontFamily: 'monospace',
                  fontSize: '13px'
                }}>
                  {parsedDataLog.map((log, index) => (
                    <div key={index} style={{
                      padding: '10px',
                      background: log.id === 2 ? '#C8E6C9' : '#f9f9f9',
                      marginBottom: '8px',
                      borderLeft: log.id === 2 ? '4px solid #4CAF50' : '4px solid #ddd',
                      borderRadius: '4px'
                    }}>
                      <div style={{ color: '#666', fontSize: '11px', marginBottom: '5px' }}>
                        {log.timestamp}
                      </div>
                      <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                        {log.type === 'CLASSIFICATION' ? '🎯 제스처 인식' : '📍 객체 감지'}
                      </div>
                      {log.type === 'CLASSIFICATION' && (
                        <div>
                          <div>ID: {log.id}</div>
                          <div>신뢰도: {log.confidence}%</div>
                        </div>
                      )}
                      {log.type === 'DETECTION' && (
                        <div>
                          <div>ID: {log.id}</div>
                          <div>위치: ({log.x}, {log.y})</div>
                          <div>크기: {log.w} × {log.h}</div>
                          <div>신뢰도: {log.confidence}%</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;