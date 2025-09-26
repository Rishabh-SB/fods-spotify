import pandas as pd
import numpy as np
from datetime import datetime
import matplotlib.pyplot as plt

# 1. Load the Dataset
df = pd.read_csv('spotify_history.csv')  # Replace with actual filename

# Typical columns expected: ts, platform, msplayed, conncountry, track, artist, track_duration_ms

# 2. Clean Data
df['ts'] = pd.to_datetime(df['ts'])
df = df.dropna(subset=['ts', 'track', 'artist', 'msplayed'])
df['date'] = df['ts'].dt.date

# 3. Define Key Metrics

def on_demand_wrapped(df, start_date=None, end_date=None):
    mask = True
    if start_date:
        mask &= (df['date'] >= pd.to_datetime(start_date).date())
    if end_date:
        mask &= (df['date'] <= pd.to_datetime(end_date).date())
    sub = df[mask]
    top_tracks = sub['track'].value_counts().head(10)
    top_artists = sub['artist'].value_counts().head(10)
    total_ms = sub['msplayed'].sum()
    return top_tracks, top_artists, total_ms

def skip_behavior(df, skip_threshold_ms=30000):
    # A skip: not played for at least 30 seconds or less than 80% of track duration
    df['is_skip'] = df['msplayed'] < skip_threshold_ms
    skip_rate = df['is_skip'].mean()
    skips_by_platform = df.groupby('platform')['is_skip'].mean()
    skips_by_artist = df.groupby('artist')['is_skip'].mean().sort_values(ascending=False).head(10)
    return skip_rate, skips_by_platform, skips_by_artist

def repeat_vs_explore(df):
    # Repeat: user listens to same track >1 times; Exploration: count of unique tracks/new tracks per month
    repeat_tracks = df['track'].value_counts()
    repeats = repeat_tracks[repeat_tracks > 1].count()
    total_tracks = repeat_tracks.count()
    exploration_ratio = 1 - (repeats / total_tracks)
    df['month'] = df['ts'].dt.to_period('M')
    monthly_new = df.groupby('month')['track'].nunique()
    return repeats, exploration_ratio, monthly_new

# 4. Example Usage

# Wrapped insights for September
top_tracks, top_artists, total_ms = on_demand_wrapped(df, start_date='2025-09-01', end_date='2025-09-30')

print("Top Tracks (September):\n", top_tracks)
print("Top Artists (September):\n", top_artists)
print("Total Listening Hours (September):", total_ms / (1000*60*60))

# Skip analysis
skip_rate, skips_by_platform, skips_by_artist = skip_behavior(df)
print("Overall Skip Rate:", skip_rate)
print("Skip Rate by Platform:\n", skips_by_platform)
print("Top Artists by Skip Rate:\n", skips_by_artist)

# Repeat and exploration metrics
repeats, explore_ratio, monthly_new_tracks = repeat_vs_explore(df)
print("Repeat Tracks:", repeats)
print("Exploration Ratio:", explore_ratio)
print("Monthly New Tracks:\n", monthly_new_tracks)

# 5. Visualization Example
monthly_new_tracks.plot(kind='bar', title='Monthly New Tracks Discovered')
plt.xlabel('Month')
plt.ylabel('Unique New Tracks')
plt.show()
