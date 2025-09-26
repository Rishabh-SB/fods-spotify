import json
import pandas as pd

def handler(request):
    length = int(request.headers.get('content-length', 0))
    body = request.rfile.read(length)
    data = json.loads(body)

    df = pd.DataFrame(data)
    df['ts'] = pd.to_datetime(df['ts'])
    df['date'] = df['ts'].dt.date
    df['month'] = df['ts'].dt.to_period('M')
    df = df[df['master_metadata_track_name'].notnull()]
    df['track'] = df['master_metadata_track_name']
    df['artist'] = df['master_metadata_album_artist_name']
    df['skipped'] = df['skipped'].fillna(False)
    df['platform'] = df['platform']

    def wrapped_summary(df):
        top_tracks = df['track'].value_counts().head(10).to_dict()
        top_artists = df['artist'].value_counts().head(10).to_dict()
        total_hours = df['ms_played'].sum() / (1000*60*60)
        return top_tracks, top_artists, total_hours

    def skip_analysis(df):
        skip_rate = float(df['skipped'].mean())
        skips_platform = df.groupby('platform')['skipped'].mean().to_dict()
        skips_artist = df.groupby('artist')['skipped'].mean().sort_values(ascending=False).head(10).to_dict()
        return skip_rate, skips_platform, skips_artist

    def repeat_explore(df):
        repeat_tracks = df['track'].value_counts()
        repeats = int(repeat_tracks[repeat_tracks > 1].count())
        total_tracks = int(repeat_tracks.count())
        exploration_ratio = 1 - (repeats / total_tracks)
        monthly_new = df.groupby('month')['track'].nunique().to_dict()
        monthly_new = {str(k): v for k,v in monthly_new.items()}
        return repeats, exploration_ratio, monthly_new

    top_tracks, top_artists, total_hours = wrapped_summary(df)
    skip_rate, skips_platform, skips_artist = skip_analysis(df)
    repeats, exploration_ratio, monthly_new = repeat_explore(df)

    response = {
        'top_tracks': top_tracks,
        'top_artists': top_artists,
        'total_hours': total_hours,
        'skip_rate': skip_rate,
        'skips_platform': skips_platform,
        'skips_artist': skips_artist,
        'repeat_tracks': repeats,
        'exploration_ratio': exploration_ratio,
        'monthly_new_tracks': monthly_new
    }

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(response)
    }
