import React from 'react';
import { Send } from 'lucide-react';
import './GoToChatButton.css';

export const GoToChatButton = ({
  onClick,
  children = 'ไปยังแชท',
  className = '',
  title = 'ไปยังห้องแชท',
  type = 'button',
  ...props
}) => {
  return (
    <button
      type={type}
      onClick={onClick}
      title={title}
      className={`chat-fly-btn ${className}`}
      {...props}
    >
      <div className="svg-wrapper-1">
        <div className="svg-wrapper">
          <Send size={15} strokeWidth={2.2} />
        </div>
      </div>
      <span>{children}</span>
    </button>
  );
};

export default GoToChatButton;
