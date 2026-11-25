from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.section import WD_SECTION
from pathlib import Path
import re

OUT = Path(__file__).parent
DOCX = OUT / 'Brand-Media-Collab-Product-Demo-Production-Guide.docx'

# BMC palette taken from existing public landing page CSS.
INK='1B2B24'; GREEN='6D8B55'; LIME='B9EE73'; PALE='F7F5F0'; WHITE='FFFFFF'; MUTED='64736A'; BORDER='E5E3DA'; DARK='26332D'

def shade(cell, fill):
    tcPr=cell._tc.get_or_add_tcPr(); shd=OxmlElement('w:shd'); shd.set(qn('w:fill'),fill); tcPr.append(shd)
def cell_margins(cell, top=90, start=100, bottom=90, end=100):
    tc=cell._tc; tcPr=tc.get_or_add_tcPr(); mar=OxmlElement('w:tcMar')
    for side,val in [('top',top),('start',start),('bottom',bottom),('end',end)]:
        node=OxmlElement('w:'+side); node.set(qn('w:w'),str(val)); node.set(qn('w:type'),'dxa'); mar.append(node)
    tcPr.append(mar)
def set_repeat_table_header(row):
    trPr=row._tr.get_or_add_trPr(); el=OxmlElement('w:tblHeader'); el.set(qn('w:val'),'true'); trPr.append(el)
def set_cell_text(cell, text, bold=False, color=INK, size=9):
    cell.text=''; p=cell.paragraphs[0]; p.paragraph_format.space_after=Pt(0)
    r=p.add_run(str(text)); r.bold=bold; r.font.name='Aptos'; r.font.size=Pt(size); r.font.color.rgb=RGBColor.from_string(color)
    cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER; cell_margins(cell)
def page_field(paragraph):
    paragraph.alignment=WD_ALIGN_PARAGRAPH.RIGHT
    r=paragraph.add_run('Brand Media Collab  |  '); r.font.name='Aptos'; r.font.size=Pt(8); r.font.color.rgb=RGBColor.from_string(MUTED)
    fld=OxmlElement('w:fldSimple'); fld.set(qn('w:instr'),'PAGE'); paragraph._p.append(fld)
def add_bullet(doc, text, level=0):
    p=doc.add_paragraph(style='List Bullet' if level==0 else 'List Bullet 2'); p.paragraph_format.space_after=Pt(3); p.add_run(text); return p
def add_num(doc, text):
    p=doc.add_paragraph(style='List Number'); p.paragraph_format.space_after=Pt(3); p.add_run(text); return p
def add_note(doc, title, body, fill='EEF3E7'):
    t=doc.add_table(rows=1, cols=1); t.alignment=WD_TABLE_ALIGNMENT.CENTER; c=t.cell(0,0); shade(c,fill); cell_margins(c,150,170,150,170); c.text=''
    p=c.paragraphs[0]; p.paragraph_format.space_after=Pt(4); r=p.add_run(title); r.bold=True; r.font.name='Aptos'; r.font.size=Pt(10); r.font.color.rgb=RGBColor.from_string(INK)
    p2=c.add_paragraph(body); p2.paragraph_format.space_after=Pt(0); p2.paragraph_format.line_spacing=1.06; p2.runs[0].font.size=Pt(9); p2.runs[0].font.color.rgb=RGBColor.from_string(DARK)
    doc.add_paragraph().paragraph_format.space_after=Pt(1)
def add_table(doc, headers, rows, widths=None, font=8.4):
    t=doc.add_table(rows=1, cols=len(headers)); t.alignment=WD_TABLE_ALIGNMENT.CENTER; t.style='Table Grid'; t.autofit=False
    if widths:
        for i,w in enumerate(widths):
            for cell in t.columns[i].cells: cell.width=Inches(w)
    for i,h in enumerate(headers): set_cell_text(t.rows[0].cells[i],h,True,WHITE,8.4); shade(t.rows[0].cells[i],INK)
    set_repeat_table_header(t.rows[0])
    for ri,row in enumerate(rows):
        cells=t.add_row().cells
        for i,v in enumerate(row):
            set_cell_text(cells[i],v,False,INK,font)
            if ri%2==1: shade(cells[i],'F4F5F1')
            if widths: cells[i].width=Inches(widths[i])
    doc.add_paragraph().paragraph_format.space_after=Pt(1)
    return t

D=Document(); sec=D.sections[0]; sec.top_margin=Inches(.62); sec.bottom_margin=Inches(.62); sec.left_margin=Inches(.72); sec.right_margin=Inches(.72)
styles=D.styles
styles['Normal'].font.name='Aptos'; styles['Normal'].font.size=Pt(9.5); styles['Normal'].font.color.rgb=RGBColor.from_string(INK)
styles['Normal'].paragraph_format.space_after=Pt(5); styles['Normal'].paragraph_format.line_spacing=1.08
for nm,size,col in [('Title',27,INK),('Heading 1',19,INK),('Heading 2',13,GREEN),('Heading 3',10,INK)]:
    st=styles[nm]; st.font.name='Aptos Display' if nm in ('Title','Heading 1','Heading 2') else 'Aptos'; st.font.size=Pt(size); st.font.bold=True; st.font.color.rgb=RGBColor.from_string(col); st.paragraph_format.space_before=Pt(10 if nm!='Title' else 0); st.paragraph_format.space_after=Pt(5)
header=sec.header.paragraphs[0]; header.text='BMC   /   PRODUCT DEMO PRODUCTION'; header.runs[0].font.name='Aptos'; header.runs[0].font.size=Pt(8); header.runs[0].font.bold=True; header.runs[0].font.color.rgb=RGBColor.from_string(GREEN)
page_field(sec.footer.paragraphs[0])

# Cover
p=D.add_paragraph(); p.paragraph_format.space_before=Pt(50); r=p.add_run('BRAND MEDIA COLLAB'); r.bold=True; r.font.name='Aptos'; r.font.size=Pt(11); r.font.color.rgb=RGBColor.from_string(GREEN)
p=D.add_paragraph(style='Title'); p.add_run('Product Demo Video\nProduction Guide')
p=D.add_paragraph(); p.paragraph_format.space_before=Pt(10); r=p.add_run('A ready-to-record script, storyboard, shot list, nine audience use cases, captions, and Windows recording steps.'); r.font.size=Pt(13); r.font.color.rgb=RGBColor.from_string(MUTED)
D.add_paragraph('Prepared for the Brand Media Collab owner, a new employee, or a video editor.',style=None)
D.add_paragraph(''); add_note(D,'Important production status','This package is ready for recording. It does not include a finished live product capture: the current environment has no authenticated production session or test accounts, so private actions and backend success could not be verified. Record those shots only after they succeed in your own test accounts. Do not fake or stage success screens.','FFF4DD')
D.add_paragraph('Brand line',style='Heading 2'); D.add_paragraph('Good work starts with the right collaborators.')
D.add_paragraph('Suggested public CTA',style='Heading 2'); D.add_paragraph('Join the network at www.brandmediacollab.com')
D.add_paragraph('Version: 1.0  |  Prepared 23 November 2026')
D.add_page_break()

D.add_heading('1. The demo in one page',level=1)
D.add_paragraph('The story is a small brand team trying to find suitable collaborators for a campaign. Brand Media Collab gives different kinds of professionals a shared place to present a profile, discover people and projects, and pursue relevant opportunities. The video should show the real site and explain the value of each step rather than narrate clicks.')
add_table(D,['Item','Production choice'],[
('Main video','About 3 minutes; 16:9 landscape; 1920 x 1080; 30 fps; MP4 H.264 if your editor offers it.'),
('Homepage cut','45 seconds; same landscape master. Reframe for portrait only after a separate 9:16 crop review.'),
('Audience','Creators and businesses seeking marketing, media, production, event, distribution, and other creative partners.'),
('Voice','Warm, confident, conversational. Aim for 125-145 spoken words per minute.'),
('Visual style','Use actual BMC screens, slow cursor movement, simple crop/zoom, short titles, restrained transitions, and readable captions.'),
('Evidence rule','Source inspection confirms some UI exists; it does not prove live behavior. Only show a completed action when it succeeds in the actual account and persists after refresh.')],widths=[1.3,5.8])
add_note(D,'A safe filming rule','Use a dedicated demo account and test records. Never show passwords, private email addresses, real user conversations, tokens, admin screens, or personal data. Use production only if you have permission and can safely avoid real user data; otherwise use a separate test project/environment.')
D.add_heading('What the source currently shows',level=2)
add_bullet(D,'Landing page: Brand Media Collab hero, “How it works” and “Who it’s for” navigation, join/login modal, and all nine account-type choices.')
add_bullet(D,'Explore page: profile-type filters for all nine account types.')
add_bullet(D,'Project page source: discover, create, save, apply, and project filters are represented; the visible project-type tabs include Brand, Creator, Agency, Celebrity, Event, and Media. Do not claim every role has a distinct project workflow.')
add_bullet(D,'The app source includes dashboard, applications, connections, messages, notifications, and profile pages. These are not live-verified in this recording environment.')
add_bullet(D,'Backend credentials and test identities are unavailable here. The final edit must omit any action that does not work in your own test session.')

D.add_heading('2. Main video script and storyboard',level=1)
D.add_paragraph('Target runtime: 2:50-3:10. The narration below is the final voice-over draft. Bracketed text is a production instruction, not spoken narration.')
scenes=[
('00:00-00:14','The search problem','Open with a clean title over a neutral background; use simple text cards such as “Too many tabs. Too many introductions.” Do not use fabricated app screens.','Finding the right collaborator can take more time than the work itself. You search across platforms, ask around, and still wonder who is the right fit.','Great campaigns need the right people.'),
('00:14-00:32','Meet BMC','Show the real public homepage at brandmediacollab.com. Hold long enough to read the hero, then a gentle crop toward the CTA.','Brand Media Collab brings brands, creators, influencers, agencies, media professionals, production teams, event companies, marketing partners, and other creative professionals into one collaboration network.','One network for creative collaboration.'),
('00:32-00:49','Find your place','Open the real signup modal. Scroll slowly through the nine role choices. Do not submit a new signup during the main take.','Whether you represent a brand, create content, run an agency, work in media, organize events, distribute products, build a community, or work independently, start by choosing the profile that best describes you.','Brands | Creators | Agencies | Celebrities | Events | Media | Communities | Distributors | Freelancers'),
('00:49-01:08','Show your profile','Use a pre-created test account. Open its actual profile or setup page. Show only fields and saved information that exist in that session.','A clear profile helps other members understand what you do, what you offer, and the kinds of partnerships you are looking for. Complete the details that matter to your work, then review how your profile appears.','Make your work and interests clear.'),
('01:08-01:32','Discover people','Open Explore. Show the page heading, search, role tabs/filters, and one real profile card. Type a query only if search returns correct results.','When you are looking for a partner, start with the people and categories that fit your brief. Search and narrow the results, then open a profile to see whether the work and interests align.','Search. Filter. Review the fit.'),
('01:32-01:57','Discover a project','Open Projects. Show live project cards and category filters. Save or open one only if the action works and reflects after refresh.','If you are looking for an opportunity, browse projects and ideas from members. Check the brief, category, dates, and requested collaborators before deciding whether it fits.','Find opportunities that fit your work.'),
('01:57-02:18','Take the next step','Show one real action: save, express interest/apply, or send a connection request, whichever succeeds in the account. Capture the resulting persisted state.','When the opportunity feels right, use the available action to save it, apply, or connect. A clear note can help explain why the partnership makes sense.','A relevant next step beats a cold search.'),
('02:18-02:36','Follow the conversation','Show Messages or Notifications only if a real test interaction exists. Keep any names and content private; use test accounts only.','For eligible project collaborations, the platform can bring the next conversation into the relevant workflow. Check the status in your dashboard and keep the discussion tied to the opportunity.','Keep collaboration moving.'),
('02:36-02:50','Nine kinds of work','Use a clean nine-label montage. The labels can be motion typography over the actual homepage or role selector; do not imply each has a separate exclusive toolset.','Creators, brands, agencies, celebrities, event teams, media, communities, distributors, and freelancers each bring something different. The opportunity is to find the combination a project needs.','Nine profile types. One network.'),
('02:50-03:02','Close','Return to the homepage, then end card with logo/name and public URL. Hold final card at least 3 seconds.','Spend less time searching in disconnected places and more time building useful partnerships. Brand Media Collab. Good work starts with the right collaborators. Join the network at brandmediacollab.com.','Brand Media Collab | Join the network | brandmediacollab.com')]
for start, title, picture, voice, overlay in scenes:
    p=D.add_paragraph()
    p.paragraph_format.space_before=Pt(6)
    p.paragraph_format.space_after=Pt(2)
    rr=p.add_run(start+'  |  '+title)
    rr.bold=True
    rr.font.color.rgb=RGBColor.from_string(GREEN)
    add_table(D,['Production note','Direction'],[('Screen action',picture),('Voice-over',voice),('Overlay',overlay)],widths=[1.05,6.0],font=8.2)
D.add_heading('Voice-over as a clean read',level=2)
script='''Finding the right collaborator can take more time than the work itself. You search across platforms, ask around, and still wonder who is the right fit.\n\nBrand Media Collab brings brands, creators, influencers, agencies, media professionals, production teams, event companies, marketing partners, and other creative professionals into one collaboration network.\n\nWhether you represent a brand, create content, run an agency, work in media, organize events, distribute products, build a community, or work independently, start by choosing the profile that best describes you.\n\nA clear profile helps other members understand what you do, what you offer, and the kinds of partnerships you are looking for. Complete the details that matter to your work, then review how your profile appears.\n\nWhen you are looking for a partner, start with the people and categories that fit your brief. Search and narrow the results, then open a profile to see whether the work and interests align.\n\nIf you are looking for an opportunity, browse projects and ideas from members. Check the brief, category, dates, and requested collaborators before deciding whether it fits.\n\nWhen the opportunity feels right, use the available action to save it, apply, or connect. A clear note can help explain why the partnership makes sense.\n\nFor eligible project collaborations, the platform can bring the next conversation into the relevant workflow. Check the status in your dashboard and keep the discussion tied to the opportunity.\n\nCreators, brands, agencies, celebrities, event teams, media, communities, distributors, and freelancers each bring something different. The opportunity is to find the combination a project needs.\n\nSpend less time searching in disconnected places and more time building useful partnerships. Brand Media Collab. Good work starts with the right collaborators. Join the network at brandmediacollab.com.'''
p=D.add_paragraph(); p.paragraph_format.left_indent=Inches(.18); p.paragraph_format.right_indent=Inches(.18)
r=p.add_run(script); r.italic=True; r.font.size=Pt(9.5)
D.add_page_break()

D.add_heading('3. Homepage overview cut',level=1)
D.add_paragraph('Target runtime: about 45 seconds. Use the real landing page and no private interactions. This cut can be embedded on the homepage or shared with prospective members.')
short=[('00:00-00:06','Text opener','Finding the right people should not be the hardest part.'),('00:06-00:17','Real homepage hero','Brand Media Collab brings brands, creators, agencies, media, event teams, and creative professionals together to find relevant opportunities.'),('00:17-00:28','Role selector + Explore screen','Build a profile that shows what you do, then discover people and projects that fit your goals.'),('00:28-00:38','Projects screen, only if live cards load','Review a brief and choose a clear next step: save, apply, or connect, when the action is available.'),('00:38-00:45','End card','Good work starts with the right collaborators. Join Brand Media Collab at brandmediacollab.com.')]
add_table(D,['Time','Picture','Voice-over / overlay'],short,widths=[1,1.65,4.65])
D.add_heading('45-second narration',level=2)
D.add_paragraph('Finding the right people should not be the hardest part. Brand Media Collab brings brands, creators, agencies, media, event teams, and creative professionals together to find relevant opportunities. Build a profile that shows what you do, then discover people and projects that fit your goals. Review a brief and choose a clear next step: save, apply, or connect, when the action is available. Good work starts with the right collaborators. Join Brand Media Collab at brandmediacollab.com.')

D.add_heading('4. Nine role-specific mini-scenes',level=1)
D.add_paragraph('Use these as 8-12 second social clips or as a quick montage in the main demo. Each line describes a member goal. These are not claims of role-specific automation or guaranteed results. Show a real profile, search result, or project action only when it works in the test account.')
roles=[
('Brand','Launch a product and find creators or other partners who fit the campaign brief.','Show the Brand role chip/profile, then a real published project or Explore search. Do not show a created/published project unless it is live.'),
('Creator','Find a project that fits your niche, formats, location, or interests.','Show Creator account type, Explore/Projects filters and a real project brief.'),
('Agency','Present services and find brands or specialist partners for a brief.','Show Agency profile and real discovery results. Avoid claiming a campaign team builder.'),
('Celebrity','Represent a public-facing talent profile and look for relevant partnership opportunities.','Show Celebrity role selection and profile fields available in the real screen.'),
('Event','Present an event organization and look for relevant projects or partners.','Show Event role selection and profile/discovery UI; do not imply ticketing or event management tools.'),
('Media','Present a media organization and explore potential brand or agency opportunities.','Show Media role selection and actual profile fields; do not claim inventory booking/measurement.'),
('Community','Explain a community’s focus and discover aligned brand or creator opportunities.','Show Community role selection/profile and real discovery UI; avoid claims of member campaign management.'),
('Distributor','Present distribution scope and explore business/marketing opportunities.','Show Distributor role selection/profile and only verified discovery options; no logistics or sales tools implied.'),
('Freelancer','Show skills and portfolio, then look for projects matching that work.','Show Freelancer role selection, profile, and a real project search.')]
add_table(D,['Account type','Member story','Safe screen direction'],roles,widths=[1.0,2.5,3.55],font=8)

D.add_heading('5. Exact screen recording plan',level=1)
D.add_paragraph('Make separate short clips rather than one long take. This makes mistakes easy to discard and keeps editing simple. The actions below are intended capture points; confirm each in your actual browser before keeping it in the final video.')
steps=[
('A. Public intro','Open https://www.brandmediacollab.com in a clean browser window. Wait for fonts/images. Record the full hero, scroll through “How it works” and “Who it’s for”, then return to the hero. Avoid showing bookmarks, account names, notifications, or browser extensions.'),
('B. Role selector','Click “Join the network”. Record the account selector and all nine choices. Do not enter personal credentials. Close the modal cleanly. This is a source-confirmed UI, but signup completion still needs live verification.'),
('C. Profile','Sign into a dedicated test account before recording. Visit profile setup or profile page. Show a few real, non-sensitive fields and the public view. If the page cannot save or loads an error, do not include a success shot.'),
('D. Explore','Open Explore. Record its title, role filters, one relevant query/filter and results. Confirm that results change as expected and do not expose private accounts.'),
('E. Projects','Open Projects. Record a project list, a brief, and a filter. If the test account owns no project, do not invent one; either use an already-created test project or omit the clip.'),
('F. Save/apply/connect','Choose a single action that is enabled in the test account. Click once, wait for the real success/error result, navigate away and back or refresh to confirm persistence. If it fails, remove the action from the edit.'),
('G. Messages/notifications','Use two test accounts you control. Trigger a real eligible event, verify the notification or conversation on the second account, and remove visible personal details. No private real-user chat.'),
('H. End card','Use the approved BMC logo asset or the existing homepage wordmark. Include the exact public URL and hold the screen long enough to read.')]
for a,b in steps:
    p=D.add_paragraph(); p.paragraph_format.space_after=Pt(4); r=p.add_run(a+'  '); r.bold=True; r.font.color.rgb=RGBColor.from_string(GREEN); p.add_run(b)

D.add_heading('6. Nine-user story coverage',level=1)
add_table(D,['Type','Need / problem','BMC story line','Do not overpromise'],[
('Creator','Needs relevant collaboration opportunities.','“Discover projects that fit your work and interests.”','Do not promise earnings, brand replies, or guaranteed campaign access.'),
('Brand','Needs collaborators for a campaign or product launch.','“Describe the opportunity and find members whose work fits.”','Do not imply verified reach, campaign analytics, or guaranteed hires.'),
('Agency','Needs clients and execution partners.','“Show your services and explore relevant people and projects.”','Do not claim built-in team assembly unless it is demonstrated.'),
('Celebrity','Needs suitable brand partnerships.','“Present a public profile and explore relevant opportunities.”','Do not imply talent representation, contract management, or endorsement clearance.'),
('Event','Needs event-related partners.','“Present your event work and look for aligned collaborators.”','Do not imply ticketing, sponsorship tracking, or event operations.'),
('Media','Needs brand/agency relationships.','“Present your media organization and explore partnership opportunities.”','Do not promise ad-inventory booking, attribution, or reach verification.'),
('Community','Needs aligned partners and activations.','“Explain your community and explore relevant collaboration opportunities.”','Do not imply member CRM or activation management.'),
('Distributor','Needs relevant brands and business opportunities.','“Describe your distribution focus and discover aligned partners.”','Do not imply inventory, order fulfillment, or logistics management.'),
('Freelancer','Needs clients/projects matching skills.','“Show your skills and portfolio, then explore matching work.”','Do not promise project award or payment processing.')],widths=[.82,1.68,2.5,2.3],font=7.5)

D.add_heading('7. Screen capture on Windows',level=1)
D.add_paragraph('Recommended simple method: Windows 11 Snipping Tool video. It is suitable for short browser clips. For a longer 3-minute recording, microphone control, or more reliable editing, OBS Studio is a good alternative.')
D.add_heading('Option 1: Snipping Tool',level=2)
for x in ['Open the website in Chrome or Edge and set browser zoom to 100%. Maximize the window. Turn on Do Not Disturb and close unrelated tabs.','Press Windows + Shift + R, or open Snipping Tool and choose Record, then New. Select only the browser content area you want to show.','Press Start. Wait one second, then perform one slow action. Pause briefly after the result appears. Avoid rapid cursor movements.','Press Stop. Preview the clip and save it with a clear name, such as 01-homepage-intro.mp4. Repeat for each scene.','Record voice-over separately in a quiet room if live system audio or mic levels are distracting. Add captions and music in Clipchamp or another editor.']:
    add_num(D,x)
D.add_paragraph('Microsoft documents Snipping Tool video capture through Record > New and the Windows + Shift + R shortcut. Availability depends on the installed Windows version. See the links in the references section.')
D.add_heading('Option 2: Xbox Game Bar',level=2)
for x in ['Open the browser tab or app to record. Press Windows + G once to confirm the Capture panel is available.','Press Windows + Alt + R to start and again to stop. Toggle microphone with Windows + Alt + M.','Find the MP4 under Videos > Captures. If Game Bar cannot capture your browser setup, use Snipping Tool or OBS instead.']:
    add_num(D,x)
D.add_paragraph('Microsoft documents the MP4 output location as Videos > Captures for Game Bar recordings.')
D.add_heading('Option 3: OBS Studio',level=2)
for x in ['Install OBS Studio from obsproject.com. Use the Auto-Configuration Wizard and choose recording.','Add a Window Capture source for the browser. Add a microphone input only if recording live narration.','Check the preview and audio meters, then make a 10-second test recording. Play it back before capturing the full set.','Click Start Recording, capture the prepared clip, then click Stop Recording. Use separate clips for each scene.']:
    add_num(D,x)
D.add_paragraph('OBS recommends testing the settings with a short recording before the real capture. Official help links are listed at the end.')

D.add_heading('8. Recording checklist',level=1)
for x in ['Use a dedicated test account for each role you plan to show. Never reveal real members’ personal details.','Confirm each role/account is available in the current live signup and profile screen before naming it in narration.','Confirm every button works in that account. Record only the success state that actually appears.','Refresh or revisit after saving/applying/connecting to verify persistence before including a “done” moment.','If email verification is configured, use an account you control and wait for the real confirmation. Do not bypass it for the demo.','Hide browser bookmarks, desktop notifications, password manager prompts, and browser extensions.','Use 16:9 horizontal capture for the main video. Keep important UI centered to allow safe cropping for social clips.','Move the cursor slowly. Pause before and after clicks. Keep each raw shot to 8-20 seconds.','Record narration in a quiet room, close to the microphone, and leave a second of silence before and after each line.','Add accurate captions, check spelling of “Brand Media Collab”, and display the correct domain: brandmediacollab.com.','Use only music you have permission to publish and keep it below narration.','Watch the final export from start to finish on both desktop and phone before sharing.']:
    p=add_bullet(D,'[ ] '+x)

D.add_heading('9. Edit timeline and style',level=1)
add_table(D,['Edit element','Recommendation'],[
('Pacing','Change shot, crop, or message every 4-8 seconds. Keep important screens readable for at least 3 seconds.'),
('Transitions','Use quick cuts or simple 0.2-0.4 sec dissolves. Avoid flashy transitions, fake cursor clicks, or simulated UI.'),
('Zooms','Use gentle 105-115% crop-ins to direct attention. Never crop out the page title or context.'),
('Titles','Use short 3-7 word overlays. Use dark charcoal text on a pale surface or white text on the existing dark green.'),
('Captions','Use sentence case, two lines maximum, high contrast, lower safe area. Proofread against the final narration.'),
('Music','Light instrumental, low volume under voice. Check the license for web and social use.'),
('Export','Main: 1920x1080, 30fps, MP4/H.264, stereo AAC. Keep a high-quality master and a smaller web copy. If your editor offers different export presets, choose its standard 1080p web preset.')],widths=[1.25,5.85])
D.add_heading('10. Quality gate before publishing',level=1)
for x in ['The site URL loads and the logo/name are correct.','The footage is from the actual current website, not a mockup or outdated screenshot.','Any action shown completed successfully in a live test account and remained saved after reload.','All nine roles are named accurately; role-fit examples are not presented as built-in role-specific tools.','No password, private message, email address, user record, or admin-only data appears.','Voice-over and captions match; captions are readable at phone size.','Sound is clear; no unlicensed music.','The CTA points to the live public domain and the video has no unsupported claims.','The export plays to the end on desktop and a phone-sized screen.']:
    add_bullet(D,'[ ] '+x)

D.add_heading('11. What could not be verified in this package',level=1)
D.add_paragraph('The website source was inspected, including the landing page, signup role selector, Explore filters, project page, and the presence of dashboard/messaging/notification scripts. The following were not verified against the live backend here: creating a new user, profile persistence, real search results, save/apply/connect success, cross-account notification delivery, realtime updates, message delivery, and status synchronization. These are filming gates, not claims that the features are broken. If a test fails, omit that footage and report the issue separately instead of editing around it.')
add_note(D,'Record honestly','If no real project or profile is available, either create a permitted test record and verify it, use only public landing-page footage, or label the video as a product overview rather than a live workflow demo. Never fabricate counts, testimonials, applications, or messages.')

D.add_heading('12. Official recording references',level=1)
for text,url in [('Microsoft: record a clip with Xbox Game Bar','https://support.microsoft.com/en-us/accessibility/windows/use-a-screen-reader-to-record-your-screen-with-xbox-game-bar'),('Microsoft: record a video snip with Snipping Tool','https://support.microsoft.com/en-us/windows/apps/use-snipping-tool-to-capture-screenshots'),('OBS Studio: Quick Start Guide','https://obsproject.com/kb/quick-start-guide')]:
    p=D.add_paragraph(style='List Bullet'); p.add_run(text+' — '); r=p.add_run(url); r.font.color.rgb=RGBColor.from_string('0563C1'); r.underline=True
D.add_paragraph('Prepared from the current project source and the supplied product-demo brief. Source code inspection is not a substitute for live product QA.')
D.save(DOCX)
print(DOCX)

