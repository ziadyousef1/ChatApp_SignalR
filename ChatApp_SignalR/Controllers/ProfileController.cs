using Chat.Web.Hubs;
using Microsoft.AspNetCore.Mvc;
using Chat.Web.Models;
using Chat.Web.ViewModels;
using Microsoft.AspNetCore.Identity;

namespace Chat.Web.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ProfileController : ControllerBase
    {
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly ChatHub _chatHub;

        public ProfileController(UserManager<ApplicationUser> userManager,ChatHub _chatHub)
        {
            _userManager = userManager;
            this._chatHub = _chatHub;
        }

        [HttpGet]
        public async Task<IActionResult> GetProfile()
        {
            var user = await _userManager.GetUserAsync(User);
            if (user == null)
            {
                return NotFound();
            }

            var profile = new
            {
                user.UserName,
                user.FullName,
                user.Avatar
            };

            return Ok(profile);
        }
        
        [HttpGet("online")]
        public async Task<ActionResult<List<UserViewModel>>> GetOnlineUsers()
        {
            var users = await _chatHub.GetOnlineUsers();
            return Ok(users);
        }
    }
}