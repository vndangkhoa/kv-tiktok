
import React, { useState } from 'react';
import type { UserProfile } from '../types';

interface UserCardProps {
  user: UserProfile;
}

const UserCard: React.FC<UserCardProps> = ({ user }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <img
            src={user.avatar}
            alt={user.username}
            className="w-16 h-16 rounded-full mr-4"
          />
          <div>
            <h2 className="text-xl font-bold">{user.nickname}</h2>
            <p className="text-gray-500 dark:text-gray-400">@{user.username}</p>
          </div>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          {isExpanded ? 'Hide Stats' : 'Show Stats'}
        </button>
      </div>
      {isExpanded && (
        <div className="mt-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="font-bold text-lg">{user.followers?.toLocaleString()}</p>
              <p className="text-gray-500 dark:text-gray-400">Followers</p>
            </div>
            <div>
              <p className="font-bold text-lg">{user.following?.toLocaleString()}</p>
              <p className="text-gray-500 dark:text-gray-400">Following</p>
            </div>
            <div>
              <p className="font-bold text-lg">{user.likes?.toLocaleString()}</p>
              <p className="text-gray-500 dark:text-gray-400">Likes</p>
            </div>
          </div>
          {user.bio && (
            <div className="mt-4">
              <h3 className="font-bold">Bio</h3>
              <p className="text-gray-600 dark:text-gray-300">{user.bio}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UserCard;
