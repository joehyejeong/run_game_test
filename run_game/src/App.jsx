// src/App.js
import { useState, useRef } from 'react';

function App() {
  const [port, setPort] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [sensorValue, setSensorValue] = useState('-');
  const iframeRef = useRef(null);

  // 아두이노 연결
  const connectArduino = async () => {
    try {
      const selectedPort = await navigator.serial.requestPort();
      await selectedPort.open({ baudRate: 9600 });
      setPort(selectedPort);
      setIsConnected(true);
      readSensorData(selectedPort);
    } catch (error) {
      console.error('연결 실패:', error);
      alert('아두이노 연결에 실패했습니다.');
    }
  };

  // 센서 데이터 읽기
  const readSensorData = async (port) => {
    const textDecoder = new TextDecoderStream();
    port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();

    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const data = line.trim();
        setSensorValue(data);

        if (data === '2') {
          console.log('센서값 2 감지! 클릭 시도...');
          simulateMouseClick();
        }
      }
    }
  };

  // 🖱️ iframe 내부 canvas에 마우스 클릭 전달
  const simulateMouseClick = () => {
    try {
      if (!iframeRef.current) {
        console.error('iframe을 찾을 수 없습니다.');
        return;
      }

      // iframe 내부 문서 접근
      const iframeDoc = iframeRef.current.contentDocument ||
        iframeRef.current.contentWindow.document;

      if (!iframeDoc) {
        console.error('iframe 문서에 접근할 수 없습니다.');
        return;
      }

      // iframe 내부의 canvas 찾기
      const canvas = iframeDoc.getElementById('c2canvas');

      if (!canvas) {
        console.error('canvas를 찾을 수 없습니다.');
        return;
      }

      console.log('Canvas 찾음! 클릭 이벤트 발생...');

      // canvas의 중앙 좌표
      const rect = canvas.getBoundingClientRect();
      const x = rect.width / 2;
      const y = rect.height / 2;

      // mousedown 이벤트
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

      // mouseup 이벤트
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

      // click 이벤트
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

      console.log('클릭 이벤트 전송 완료!');

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
          센서값: <span style={{
            color: sensorValue === '2' ? '#4CAF50' : '#666',
            fontSize: '24px'
          }}>{sensorValue}</span>
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
        <p>💡 조도센서 값이 400 이상(2)이면 자동 점프!</p>
        <p>🧪 "클릭 테스트" 버튼으로 먼저 작동 확인해보세요</p>
        {isConnected && <p style={{ color: '#4CAF50' }}>✅ 아두이노 연결됨 - F12 콘솔에서 로그 확인 가능</p>}
      </div>
    </div>
  );
}

export default App;